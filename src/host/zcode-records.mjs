import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

const JSON_FORMAT = 'omaa.zcode.json';
const RUN_FORMAT = 'omaa.zcode.run';
const PAGE_FORMAT = 'omaa.zcode.page';
const VERSION = 2;
const INLINE_BYTES = 1024;
const CHUNK_BYTES = 64 * 1024;
const PAGE_BYTES = 128 * 1024;
// Even object leaves containing the largest inline keys AND values fit under
// PAGE_BYTES, including descriptors and JSON punctuation.
const FANOUT = 32;
const MAX_DEPTH = 64;
const digestOf = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = () => { throw Error('工作流存储格式或完整性无效'); };
const integer = value => Number.isSafeInteger(value) && value >= 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const jsonBytes = value => Buffer.from(JSON.stringify(value));
const parse = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const sum = values => {
  const value = values.reduce((total, item) => total + item, 0);
  if (!integer(value)) fail();
  return value;
};

export function validateNativeFileRef(ref) {
  if (!object(ref) || typeof ref.attachmentId !== 'string' || !ref.attachmentId ||
    typeof ref.name !== 'string' || !integer(ref.bytes)) fail();
  return ref;
}

// Use only the native immutable attachment capability. No path, preview URL,
// backend-specific method, or custom identifier is interpreted by this codec.
export function createZCodeRecordCodec(attachments) {
  // Item references are opaque data in a run record. Keep a few reachable-page
  // indexes separately so append-only continuation lists can reuse their own
  // pages. Eviction or restart merely requires a verified predecessor read.
  const itemIndexes = new Map();
  const itemKey = ref => digestOf(jsonBytes(ref));
  const retainItem = (ref, index, previousRef) => {
    if (previousRef?.format === JSON_FORMAT) itemIndexes.delete(itemKey(previousRef));
    const key = itemKey(ref);
    itemIndexes.delete(key); itemIndexes.set(key, new Map([...index].map(([digest, native]) => [digest, { ...native }])));
    while (itemIndexes.size > 16) itemIndexes.delete(itemIndexes.keys().next().value);
  };
  const bytesOf = async (ref, signal, maximum = Infinity) => {
    validateNativeFileRef(ref);
    if (ref.bytes > maximum) fail();
    signal?.throwIfAborted();
    const parts = []; let count = 0;
    for await (const chunk of attachments.readFileStream(ref, signal)) {
      if (!(chunk instanceof Uint8Array)) fail();
      count += chunk.byteLength;
      if (!integer(count) || count > ref.bytes) fail();
      parts.push(Buffer.from(chunk));
    }
    // Exhaust the native stream: its final step verifies the attachment digest.
    if (count !== ref.bytes) fail();
    signal?.throwIfAborted();
    return Buffer.concat(parts, count);
  };
  const saveNative = async (bytes, name) => {
    const ref = validateNativeFileRef(await attachments.saveFile({ data: bytes, name }));
    if (ref.bytes !== bytes.byteLength) fail();
    return ref;
  };
  const readNativeJson = async (ref, signal, maximum) => parse(await bytesOf(ref, signal, maximum));

  async function encode(value, previous = new Map()) {
    // Match the old JSON attachment semantics, including omitted undefined
    // object fields and null array slots. The public API remains expanded JSON.
    const normalized = JSON.parse(JSON.stringify(value));
    const index = new Map();
    const save = async (bytes, name) => {
      const digest = digestOf(bytes);
      const ref = index.get(digest) ?? previous.get(digest) ?? await saveNative(bytes, name);
      if (ref.bytes !== bytes.length) fail();
      index.set(digest, ref);
      return { ref, digest };
    };
    const page = async (kind, children, bytes, count) => {
      const data = jsonBytes({ format: PAGE_FORMAT, version: VERSION, kind, children });
      if (children.length < 1 || children.length > FANOUT || data.length > PAGE_BYTES) fail();
      return { kind, bytes, ...(count === undefined ? {} : { count }), ...await save(data, 'workflow-page.json') };
    };
    const branch = async (kind, nodes) => {
      while (nodes.length > 1) {
        const next = [];
        for (let offset = 0; offset < nodes.length; offset += FANOUT) {
          const children = nodes.slice(offset, offset + FANOUT);
          next.push(await page(kind, children, sum(children.map(child => child.bytes)),
            kind === 'chunks' ? undefined : sum(children.map(child => child.count))));
        }
        nodes = next;
      }
      return nodes[0];
    };
    const scalar = async value => {
      const data = jsonBytes(value);
      if (data.length <= INLINE_BYTES) return { kind: 'inline', bytes: data.length, value };
      const chunks = [];
      for (let offset = 0; offset < data.length; offset += CHUNK_BYTES) {
        const bytes = data.subarray(offset, offset + CHUNK_BYTES);
        chunks.push({ kind: 'chunk', bytes: bytes.length, ...await save(bytes, 'workflow-content.bin') });
      }
      return chunks.length === 1 ? page('chunks', chunks, data.length) : branch('chunks', chunks);
    };
    const visit = async (value, depth) => {
      if (depth > MAX_DEPTH) fail();
      if (value === null || typeof value !== 'object') return scalar(value);
      const array = Array.isArray(value), children = [];
      let inline = true;
      for (const [key, item] of array ? value.entries() : Object.entries(value)) {
        const child = await visit(item, depth + 1);
        if (array) children.push(child);
        else children.push([await scalar(key), child]);
        inline &&= array ? child.kind === 'inline' : children.at(-1).every(node => node.kind === 'inline');
      }
      const bytes = sum([2, Math.max(0, children.length - 1), sum(children.map(child => array ? child.bytes : child[0].bytes + 1 + child[1].bytes))]);
      if (inline && bytes <= INLINE_BYTES) return { kind: 'inline', bytes, value };
      const kind = array ? 'array' : 'object', leaves = [];
      for (let offset = 0; offset < children.length; offset += FANOUT) {
        const entries = children.slice(offset, offset + FANOUT);
        // Container punctuation belongs to its root, not reference pages.
        leaves.push(await page(kind, entries, sum(entries.map(child => array ? child.bytes : child[0].bytes + 1 + child[1].bytes)), entries.length));
      }
      const root = await branch(kind + '-branch', leaves);
      return { ...root, bytes };
    };
    const root = await visit(normalized, 0);
    return { ref: { format: JSON_FORMAT, version: VERSION, bytes: root.bytes, root }, index };
  }

  async function decode(ref, signal) {
    if (!exactKeys(ref, ['format', 'version', 'bytes', 'root']) || ref.format !== JSON_FORMAT ||
      ref.version !== VERSION || !integer(ref.bytes) || ref.bytes < 1) fail();
    const index = new Map(), path = new Set();
    const verify = async (node, maximum) => {
      if (typeof node.digest !== 'string' || !/^[a-f0-9]{64}$/.test(node.digest)) fail();
      const bytes = await bytesOf(node.ref, signal, maximum);
      if (digestOf(bytes) !== node.digest) fail();
      index.set(node.digest, node.ref);
      return bytes;
    };
    const visit = async (node, depth, context = 'value', referenceDepth = 0) => {
      signal?.throwIfAborted();
      if (depth > MAX_DEPTH || referenceDepth > MAX_DEPTH || !object(node) || !integer(node.bytes) || node.bytes > ref.bytes) fail();
      if (node.kind === 'inline') {
        if (context !== 'value' || !exactKeys(node, ['kind', 'bytes', 'value']) || jsonBytes(node.value).length !== node.bytes || node.bytes > INLINE_BYTES) fail();
        return node.value;
      }
      const chunk = node.kind === 'chunk', chunks = node.kind === 'chunks';
      const array = ['array', 'array-branch'].includes(node.kind), pairs = ['object', 'object-branch'].includes(node.kind);
      if (!chunk && !chunks && !array && !pairs || !exactKeys(node, ['kind', 'bytes', 'ref', 'digest', ...((array || pairs) ? ['count'] : [])])) fail();
      if ((array || pairs) && (!integer(node.count) || node.count > ref.bytes)) fail();
      if (context === 'chunk' && !chunk && !chunks || context === 'array' && !array || context === 'object' && !pairs) fail();
      if (chunk) {
        if (context !== 'chunk' || node.bytes !== node.ref?.bytes || node.bytes < 1) fail();
        return verify(node, CHUNK_BYTES);
      }
      if (path.has(node.digest)) fail();
      path.add(node.digest);
      try {
        const page = parse(await verify(node, PAGE_BYTES));
        if (!exactKeys(page, ['format', 'version', 'kind', 'children']) || page.format !== PAGE_FORMAT || page.version !== VERSION ||
          page.kind !== node.kind || !Array.isArray(page.children) || !page.children.length || page.children.length > FANOUT) fail();
        if (chunks) {
          if (sum(page.children.map(child => child.bytes)) !== node.bytes) fail();
          const parts = [];
          for (const child of page.children) parts.push(await visit(child, depth, 'chunk', referenceDepth + 1));
          if (sum(parts.map(part => part.length)) !== node.bytes) fail();
          const bytes = Buffer.concat(parts, node.bytes);
          if (context === 'chunk') return bytes;
          const value = parse(bytes);
          if (typeof value !== 'string' || !jsonBytes(value).equals(bytes)) fail();
          return value;
        }
        const entries = [];
        if (node.kind.endsWith('-branch')) {
          const punctuation = context === 'value' ? 2 + Math.max(0, node.count - 1) : 0;
          if (sum(page.children.map(child => child.bytes)) + punctuation !== node.bytes || sum(page.children.map(child => child.count)) !== node.count) fail();
          for (const child of page.children) {
            const values = await visit(child, depth, array ? 'array' : 'object', referenceDepth + 1);
            for (const value of values) entries.push(value);
          }
        } else if (array) {
          if (sum(page.children.map(child => child.bytes)) + (context === 'value' ? 2 + Math.max(0, node.count - 1) : 0) !== node.bytes || page.children.length !== node.count) fail();
          for (const child of page.children) entries.push(await visit(child, depth + 1));
        } else {
          if (page.children.length !== node.count) fail();
          let declaredBytes = 0;
          for (const pair of page.children) {
            if (!Array.isArray(pair) || pair.length !== 2 || !integer(pair[0]?.bytes) || !integer(pair[1]?.bytes)) fail();
            declaredBytes = sum([declaredBytes, pair[0].bytes, 1, pair[1].bytes]);
          }
          if (declaredBytes + (context === 'value' ? 2 + Math.max(0, node.count - 1) : 0) !== node.bytes) fail();
          for (const pair of page.children) {
            if (!Array.isArray(pair) || pair.length !== 2) fail();
            const key = await visit(pair[0], depth + 1);
            if (typeof key !== 'string') fail();
            entries.push([key, await visit(pair[1], depth + 1)]);
          }
        }
        if (entries.length !== node.count) fail();
        const entryBytes = sum(entries.map(entry => array ? jsonBytes(entry).length : jsonBytes(entry[0]).length + 1 + jsonBytes(entry[1]).length));
        if (context === 'array' || context === 'object') {
          if (node.bytes !== entryBytes) fail();
          return entries;
        }
        if (node.bytes !== 2 + Math.max(0, entries.length - 1) + entryBytes) fail();
        const value = array ? entries : Object.fromEntries(entries);
        if (!array && Object.keys(value).length !== entries.length || jsonBytes(value).length !== node.bytes) fail();
        return value;
      } finally { path.delete(node.digest); }
    };
    if (ref.root?.bytes !== ref.bytes) fail();
    const value = await visit(ref.root, 0);
    return { value, index };
  }

  const readItem = async (ref, signal, maximum = Infinity) => {
    if (!integer(ref?.bytes) || ref.bytes > maximum) fail();
    if (object(ref) && Object.hasOwn(ref, 'format')) {
      const decoded = await decode(ref, signal);
      retainItem(ref, decoded.index);
      return decoded.value;
    }
    return readNativeJson(ref, signal);
  };
  const saveItem = async (value, previousRef) => {
    const data = jsonBytes(value);
    // Keep small existing report refs native, including their .bytes semantics.
    if (data.length <= CHUNK_BYTES) return saveNative(data, 'report.json');
    let previous;
    if (previousRef !== undefined) {
      if (object(previousRef) && Object.hasOwn(previousRef, 'format')) {
        previous = itemIndexes.get(itemKey(previousRef)) ?? (await decode(previousRef)).index;
      } else {
        // Small predecessors have no reusable pages, but still validate the
        // supplied native attachment before accepting it as a predecessor.
        await readNativeJson(previousRef);
      }
    }
    const encoded = await encode(value, previous);
    retainItem(encoded.ref, encoded.index, previousRef);
    return encoded.ref;
  };
  const saveRecord = async (record, previous) => {
    const encoded = await encode(record, previous);
    const data = jsonBytes({ format: RUN_FORMAT, version: VERSION, runId: record.runId, sessionId: record.sessionId, record: encoded.ref });
    if (data.length > PAGE_BYTES) fail();
    return { ref: await saveNative(data, 'workflow.json'), index: encoded.index };
  };
  const readRecord = async (ref, sessionId, runId) => {
    // Legacy whole-record attachments stay readable and are never rewritten
    // unless an authorized run mutation creates a new summary revision.
    const envelope = await readNativeJson(ref);
    if (envelope?.runId !== runId || envelope?.sessionId !== sessionId) fail();
    if (Object.hasOwn(envelope, 'format')) {
      if (ref.bytes > PAGE_BYTES) fail();
      if (!exactKeys(envelope, ['format', 'version', 'runId', 'sessionId', 'record']) || envelope.format !== RUN_FORMAT || envelope.version !== VERSION) fail();
      const decoded = await decode(envelope.record);
      if (decoded.value?.runId !== runId || decoded.value?.sessionId !== sessionId) fail();
      return { record: decoded.value, index: decoded.index };
    }
    return { record: envelope, index: new Map() };
  };
  return { bytesOf, readItem, saveItem, saveRecord, readRecord };
}
