import test from 'node:test';
import assert from 'node:assert/strict';
import { savedWorkflowDefinition, savedWorkflowDraft, savedWorkflowArgs, submitSavedWorkflowRequest } from '../src/client/zcode-saved-workflow-state.mjs';

const definition = { name: 'reuse', scope: 'project', path: '/isolated/.zcode/workflows/reuse.dwf.ts', facade: 'zcode', script: 'return args;', source: 'saved source', description: 'Reuse typed parameters', args: {
  text: { type: 'string', required: true }, count: { type: 'number', default: 0 }, enabled: { type: 'boolean', default: false }, data: { type: 'json', default: null },
} };

test('saved parameters preserve omission, empty string, zero, false and JSON with the existing argument contract', () => {
  assert(savedWorkflowDefinition(definition));
  assert.equal(savedWorkflowDefinition({ ...definition, args: { value: { type: 'unknown' } } }), undefined);
  const draft = savedWorkflowDraft(definition);
  assert.deepEqual(savedWorkflowArgs(definition, draft), { ok: true, args: { text: '' }, argsJson: '{"text":""}' });
  for (const [name, text] of [['count', '0'], ['enabled', 'false'], ['data', 'null']]) draft[name] = { include: true, text };
  assert.deepEqual(savedWorkflowArgs(definition, draft), { ok: true, args: { text: '', count: 0, enabled: false, data: null }, argsJson: '{"text":"","count":0,"enabled":false,"data":null}' });
  draft.data.text = '{"nested":[0,false,"",null]}';
  assert.deepEqual(savedWorkflowArgs(definition, draft).args.data, { nested: [0, false, '', null] });
  draft.text.include = false;
  assert.match(savedWorkflowArgs(definition, draft).errors.join('\n'), /missing required argument 'text'/);
  draft.text.include = true;
  for (const value of ['', 'Infinity', '1e999', '"0"', 'true', '0x10']) {
    draft.count.text = value;
    assert.equal(savedWorkflowArgs(definition, draft).ok, false, value);
  }
  draft.count.text = '0'; draft.data.text = '{broken';
  assert.equal(savedWorkflowArgs(definition, draft).ok, false);
  draft.data.text = 'null'; draft.extra = { include: true, text: 'extra' };
  assert.match(savedWorkflowArgs(definition, draft).errors.join('\n'), /unknown argument 'extra'/);
  assert.equal(savedWorkflowArgs({ ...definition, args: { count: { type: 'number', default: false } } }, {}).ok, false);
});

test('JSON parameters reject numeric overflow before serialization and preserve ordinary __proto__ data', () => {
  const saved = { ...definition, args: { data: { type: 'json' } } };
  for (const text of ['1e999', '-1e999', '{"nested":[0,{"overflow":1e999}]}', '[{"value":-1e999}]']) {
    assert.equal(savedWorkflowArgs(saved, { data: { include: true, text } }).ok, false, text);
  }
  const text = '{"__proto__":{"ordinary":true},"nested":[0,false,"",null]}';
  const checked = savedWorkflowArgs(saved, { data: { include: true, text } });
  assert.equal(checked.ok, true); assert.equal(Object.hasOwn(checked.args.data, '__proto__'), true);
  assert.deepEqual(checked.args.data.__proto__, { ordinary: true });
  assert.equal(Object.getPrototypeOf(checked.args.data), Object.prototype);
  assert.deepEqual(JSON.parse(JSON.stringify(checked.args.data)), JSON.parse(text));
});

test('explicit integers reject precision loss while safe boundaries and native decimals remain valid', () => {
  for (const type of ['number', 'json']) {
    const saved = { ...definition, args: { value: { type } } };
    for (const text of ['9007199254740993', '-9007199254740993']) assert.equal(savedWorkflowArgs(saved, { value: { include: true, text } }).ok, false, `${type}:${text}`);
    for (const text of ['9007199254740991', '-9007199254740991', '1e3', '1.25', '0']) assert.equal(savedWorkflowArgs(saved, { value: { include: true, text } }).ok, true, `${type}:${text}`);
  }
  const saved = { ...definition, args: { value: { type: 'json' } } };
  for (const text of ['{"value":9007199254740993}', '[0,{"value":-9007199254740993}]']) assert.equal(savedWorkflowArgs(saved, { value: { include: true, text } }).ok, false, text);
  const defaults = { ...definition, args: { value: { type: 'number', default: 9007199254740992 } } };
  assert.deepEqual(savedWorkflowArgs(defaults, {}), { ok: true, args: {}, argsJson: '{}' }, 'Omitted defaults remain owned by the current backend definition');
});

function sessionFixture() {
  let state = { sessionId: 'one', agentPreset: 'omaa-zcode', data: { product: { id: 'zcode' }, mode: 'default', running: false } }, mounted = 'one', alive = true, ready;
  const prompts = [], submissions = [];
  const session = { getSnapshot: () => ({ running: state.data.running }),
    beginSubmission(value) { const submission = { ...value, requestId: 'native-request-id', abandon() { submission.abandoned = true; } }; submissions.push(submission); return submission; },
    async prompt(...args) { prompts.push(args); return { ok: true, value: { accepted: true } }; },
  };
  const deps = { settings: { getSnapshot: () => state }, sidebarRight: { mounted: { getSnapshot: () => mounted } }, sessionId: 'one', alive: () => alive,
    sessions: { using(id, options, fn) { assert.equal(id, 'one'); assert.equal(options.source, 'omaa-zcode-saved-workflow'); return fn({ ready: ready || Promise.resolve({ session }) }); } } };
  return { deps, prompts, submissions, session, setState: patch => { state = { ...state, ...patch, data: { ...state.data, ...patch.data } }; }, mount: id => { mounted = id; }, close: () => { alive = false; }, hold: () => { let resolve; ready = new Promise(done => { resolve = done; }); return () => resolve({ session }); } };
}

test('saved request uses the current native submission receipt and refuses stale, busy and read-only execution', async () => {
  const f = sessionFixture();
  await submitSavedWorkflowRequest(f.deps, 'run', { name: 'reuse', scope: 'project', args: { count: 0, enabled: false }, argsJson: '{"count":0,"enabled":false}' });
  assert.equal(f.prompts.length, 1); assert.equal(f.prompts[0][3], 'native-request-id'); assert.equal(f.submissions[0].mode, 'queue');
  assert.match(f.prompts[0][0][0].text, /"count":0,"enabled":false/);
  assert.match(f.prompts[0][0][0].text, /current saved definition/);
  f.setState({ data: { mode: 'ask' } });
  await assert.rejects(submitSavedWorkflowRequest(f.deps, 'run', { name: 'reuse', scope: 'project', args: {} }), /执行模式/);
  await submitSavedWorkflowRequest(f.deps, 'read', definition);
  assert.match(f.prompts[1][0][0].text, /without running/);
  f.setState({ data: { running: true } });
  await assert.rejects(submitSavedWorkflowRequest(f.deps, 'read', definition), /当前任务/);
  f.setState({ data: { running: false }, agentPreset: 'omaa-cursor' });
  await assert.rejects(submitSavedWorkflowRequest(f.deps, 'read', definition), /会话已切换/);
  for (const change of [f => f.mount('two'), f => f.close(), f => f.setState({ data: { running: true } })]) {
    const next = sessionFixture(), release = next.hold(), result = submitSavedWorkflowRequest(next.deps, 'read', definition);
    change(next); release(); await assert.rejects(result);
    assert.equal(next.prompts.length, 0); assert.equal(next.submissions.length, 0);
  }
  const rejected = sessionFixture(); rejected.session.prompt = async () => ({ ok: true, value: { accepted: false } });
  await assert.rejects(submitSavedWorkflowRequest(rejected.deps, 'read', definition), /未接受/);
  assert.equal(rejected.submissions[0].abandoned, true);
});

test('validated argument material retains negative zero, exponent, quoted keys and string escapes in the native prompt', async () => {
  const saved = { ...definition, args: { direct: { type: 'number' }, data: { type: 'json' }, exponent: { type: 'number' }, 'quote"\nkey': { type: 'string' } } };
  const draft = { direct: { include: true, text: '-0' }, data: { include: true, text: '{"__proto__":{"ordinary":true},"nested":[-0,false,0,null]}' }, exponent: { include: true, text: '1e3' }, 'quote"\nkey': { include: true, text: 'value"\nline' } };
  const checked = savedWorkflowArgs(saved, draft); assert.equal(checked.ok, true);
  const parsed = JSON.parse(checked.argsJson);
  assert(Object.is(parsed.direct, -0)); assert(Object.is(parsed.data.nested[0], -0)); assert.equal(parsed.exponent, 1000);
  assert.deepEqual(parsed, checked.args); assert.equal(Object.getPrototypeOf(parsed.data), Object.prototype); assert(Object.hasOwn(parsed.data, '__proto__'));
  const f = sessionFixture(); await submitSavedWorkflowRequest(f.deps, 'run', { name: 'reuse', scope: 'project', args: checked.args, argsJson: checked.argsJson });
  const text = f.prompts[0][0][0].text;
  assert.match(text, /"direct":-0/); assert.match(text, /"nested":\[-0,false,0,null\]/); assert.match(text, /"exponent":1e3/);
  const request = JSON.parse(text.match(/arguments: ([\s\S]+)\. Read the current saved definition/)[1]);
  assert(Object.is(request.args.direct, -0)); assert.deepEqual(request.args, checked.args);
  assert.equal(Object.hasOwn(request, 'argsJson'), false, 'Material metadata is not a real tool argument');
  await assert.rejects(submitSavedWorkflowRequest(f.deps, 'run', { name: 'reuse', scope: 'project', args: checked.args, argsJson: checked.argsJson.replace('"direct":-0', '"direct":0') }), /参数材料/);
  assert.equal(f.prompts.length, 1);
});
