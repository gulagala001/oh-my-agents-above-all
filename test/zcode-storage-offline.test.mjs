import test from 'node:test';
import assert from 'node:assert/strict';
import { createZCodeRecordCodec } from '../src/host/zcode-records.mjs';
import { createZCodeArtifactStore } from '../src/host/zcode-artifacts.mjs';
import { startHeaderRecord, decodeContinuationRecord } from '../src/presets/zcode/continuation-records.mjs';

// Explicit offline mocks: no native host, model, API, network, or real user data.
function fixture() {
  const files = new Map(), rows = new Map();
  let saves = 0, reads = 0, failPut = false, streamMode;
  const attachments = {
    async saveFile({ data, name }) {
      const bytes = Buffer.from(data), attachmentId = `mock-${++saves}`;
      files.set(attachmentId, bytes);
      return { attachmentId, name, bytes: bytes.length };
    },
    async *readFileStream(ref) {
      reads++;
      const bytes = files.get(ref.attachmentId);
      assert(bytes, 'mock attachment must exist');
      if (streamMode === 'short') { yield bytes.subarray(1); return; }
      if (streamMode === 'long') { yield bytes; yield Buffer.from('!'); return; }
      yield bytes.subarray(0, 7); yield bytes.subarray(7);
      if (streamMode === 'final-error') throw Error('mock native final digest rejection');
    },
  };
  const table = {
    get: key => structuredClone(rows.get(key)),
    entries: () => [...rows.entries()].map(([key, value]) => [key, structuredClone(value)]),
    async put(key, value) { if (failPut) throw Error('mock summary commit failed'); rows.set(key, structuredClone(value)); },
  };
  return { files, rows, attachments,
    ctx: { attachments, storageDomain: { async open() { return { table: () => table, async close() {} }; } } },
    get saves() { return saves; }, get reads() { return reads; },
    set failPut(value) { failPut = value; }, set streamMode(value) { streamMode = value; },
  };
}
const runId = '11111111-1111-4111-8111-111111111111', sessionId = 'mock-session';
const bigValue = () => ({ text: '中文🌱'.repeat(25000), rows: Array.from({ length: 1100 }, (_, n) => ({ n, text: `row-${n}` })) });

test('immutable v2 content survives codec restart; append reuses predecessor pages without altering old versions', async () => {
  const f = fixture(), codec = createZCodeRecordCodec(f.attachments), value = bigValue();
  const first = await codec.saveItem(value);
  assert.equal(first.format, 'omaa.zcode.json');
  assert.equal(first.bytes, Buffer.byteLength(JSON.stringify(value)));
  const oldFiles = new Map([...f.files].map(([id, bytes]) => [id, Buffer.from(bytes)]));
  const nextValue = structuredClone(value); nextValue.rows.push({ n: 1100, text: 'new row' });
  const cold = createZCodeRecordCodec(f.attachments), before = f.saves;
  const second = await cold.saveItem(nextValue, first), incrementalWrites = f.saves - before;
  const freshFixture = fixture(); await createZCodeRecordCodec(freshFixture.attachments).saveItem(nextValue);
  assert(incrementalWrites < freshFixture.saves, 'unchanged predecessor pages must be reused after restart');
  for (const [id, bytes] of oldFiles) assert.deepEqual(f.files.get(id), bytes);
  assert.deepEqual(await createZCodeRecordCodec(f.attachments).readItem(first), value);
  assert.deepEqual(await createZCodeRecordCodec(f.attachments).readItem(second), nextValue);
});

test('v2 rejects corrupted bytes and metadata; native streams must finish successfully with exact length', async () => {
  const f = fixture(), codec = createZCodeRecordCodec(f.attachments), ref = await codec.saveItem(bigValue());
  const bytes = f.files.get(ref.root.ref.attachmentId), corrupted = Buffer.from(bytes);
  corrupted[0] ^= 1; f.files.set(ref.root.ref.attachmentId, corrupted);
  await assert.rejects(createZCodeRecordCodec(f.attachments).readItem(ref), /完整性/);
  f.files.set(ref.root.ref.attachmentId, bytes);
  const invalid = structuredClone(ref); invalid.bytes++;
  await assert.rejects(codec.readItem(invalid), /完整性/);
  const small = await codec.saveItem({ mock: true });
  for (const mode of ['short', 'long', 'final-error']) {
    f.streamMode = mode;
    await assert.rejects(codec.readItem(small), mode === 'final-error' ? /native final digest/ : /完整性/);
  }
  f.streamMode = undefined;
  await assert.rejects(codec.readItem(ref, undefined, ref.bytes - 1), /完整性/);
});

test('run envelopes enforce owner and keep legacy records readable without rewriting', async () => {
  const f = fixture(), codec = createZCodeRecordCodec(f.attachments);
  const record = { runId, sessionId, revision: 1, artifacts: [], reports: [], payload: bigValue() };
  const saved = await codec.saveRecord(record);
  assert.deepEqual((await createZCodeRecordCodec(f.attachments).readRecord(saved.ref, sessionId, runId)).record, record);
  await assert.rejects(codec.readRecord(saved.ref, 'other-session', runId), /完整性/);
  const legacy = await f.attachments.saveFile({ data: Buffer.from(JSON.stringify(record)), name: 'legacy.json' });
  const before = f.saves;
  assert.deepEqual((await codec.readRecord(legacy, sessionId, runId)).record, record);
  assert.equal(f.saves, before);
});

async function seededStore(f) {
  const store = await createZCodeArtifactStore(f.ctx), codec = createZCodeRecordCodec(f.attachments);
  const script = '// explicit offline mock source\n' + 'const mock = 1;\n'.repeat(6000);
  const scriptRef = await codec.saveItem(script), argsRef = await codec.saveItem({}), modelBindingsRef = await codec.saveItem([]);
  const header = startHeaderRecord({ sessionId, runId, revision: 1, cwd: '/mock-only', scriptRef, argsRef, modelBindingsRef });
  const startHeaderRef = await codec.saveItem(header);
  await store.begin({ runId, sessionId, name: 'mock run', execution: { version: 2, startHeaderRef, actors: [], world: [] } }, () => {});
  return { store, script, header };
}

test('cold source reads verify continuation ownership, isolate callers, and never write storage', async () => {
  const f = fixture(), { store, script, header } = await seededStore(f);
  await store.finish(sessionId, runId, { value: { mock: true } }); await store.close();
  const cold = await createZCodeArtifactStore(f.ctx), before = f.saves;
  assert.equal((await cold.source(sessionId, runId)).script, script);
  assert.equal((await cold.inspect(sessionId, runId)).status, 'completed');
  const copy = await cold.record(sessionId, runId); copy.name = 'caller mutation'; copy.artifacts.push({ id: 'fake' });
  assert.equal((await cold.record(sessionId, runId)).name, 'mock run');
  await assert.rejects(cold.source('other-session', runId), /会话/);
  assert.throws(() => decodeContinuationRecord('start-header', header, { sessionId: 'other', runId }), /owned/);
  assert.equal(f.saves, before, 'cold reads must not create attachments or new versions');
  await cold.close();
});

test('summary commit failure cannot publish an uncommitted mutation in live or restarted storage', async () => {
  const f = fixture(), { store } = await seededStore(f), before = await store.record(sessionId, runId);
  f.failPut = true;
  await assert.rejects(store.mutate(sessionId, runId, draft => { draft.name = 'uncommitted mock'; }), /summary commit failed/);
  assert.deepEqual(await store.record(sessionId, runId), before);
  f.failPut = false;
  const cold = await createZCodeArtifactStore(f.ctx);
  assert.deepEqual(await cold.record(sessionId, runId), JSON.parse(JSON.stringify(before)));
  await Promise.all([store.close(), cold.close()]);
});


test('cold cache follows committed root changes and checks authorization even on cache hits', async () => {
  const f = fixture(), { store } = await seededStore(f);
  await store.finish(sessionId, runId, { value: 'mock outcome' });
  const cold = await createZCodeArtifactStore(f.ctx);
  assert.equal((await cold.record(sessionId, runId)).name, 'mock run');
  await store.mutate(sessionId, runId, draft => { draft.name = 'committed mock revision'; });
  assert.equal((await cold.record(sessionId, runId)).name, 'committed mock revision');
  const [key, summary] = [...f.rows][0];
  f.rows.set(key, { ...summary, sessionId: 'different mock owner' });
  await assert.rejects(cold.record(sessionId, runId), /会话/);
  await Promise.all([store.close(), cold.close()]);
});

test('source endpoint rejects a durable continuation header belonging to another run', async () => {
  const f = fixture(), { store, header } = await seededStore(f);
  const wrongHeader = startHeaderRecord({ ...header, runId: '22222222-2222-4222-8222-222222222222' });
  const wrongRef = await store.saveItem(wrongHeader);
  await store.mutate(sessionId, runId, draft => { draft.execution.startHeaderRef = wrongRef; });
  const cold = await createZCodeArtifactStore(f.ctx);
  await assert.rejects(cold.source(sessionId, runId), /owned/);
  await Promise.all([store.close(), cold.close()]);
});
