import { createHash } from 'node:crypto';

const MAX_BYTES = 30000;
const kinds = new Set(['pending', 'calendar', 'native']);
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Pure pagination over an already authorized, owner-scoped descriptor roster.
 * read() must synchronously return a bounded JSON object. This is no live CAS.
 */
export function cronListPage({ ownerSessionId, workspacePath, entries, cursor, limit = 10 }) {
  if (typeof ownerSessionId !== 'string' || !ownerSessionId || typeof workspacePath !== 'string'
    || !Array.isArray(entries) || !Number.isSafeInteger(limit) || limit < 1 || limit > 50)
    fail('cron_page_invalid', 'Invalid owner scope, descriptor roster or page limit (1–50).');
  const seen = new Set();
  const roster = entries.map(entry => {
    if (!object(entry) || !kinds.has(entry.kind) || typeof entry.id !== 'string' || !entry.id
      || entry.id.length > 1024 || typeof entry.read !== 'function'
      || (entry.createdAt !== undefined && !Number.isFinite(entry.createdAt)))
      fail('cron_page_invalid', 'Invalid cron entry descriptor.');
    const key = JSON.stringify([entry.kind, entry.id]);
    if (seen.has(key)) fail('cron_page_invalid', 'Duplicate cron entry identity.');
    seen.add(key);
    return { ...entry };
  }).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)
    || compare(a.kind, b.kind) || compare(a.id, b.id));
  const scopeHash = hash(JSON.stringify([ownerSessionId, workspacePath]));
  const rosterHash = hash(JSON.stringify(roster.map(row => [row.kind, row.id])));
  let offset = 0;
  if (cursor !== undefined) {
    if (typeof cursor !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(cursor))
      fail('cron_cursor_invalid', 'Invalid cron list cursor.');
    let decoded;
    try {
      const raw = Buffer.from(cursor, 'base64url');
      if (raw.toString('base64url') !== cursor) throw Error();
      decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    } catch { fail('cron_cursor_invalid', 'Invalid cron list cursor encoding.'); }
    if (!object(decoded) || Object.keys(decoded).sort().join(',') !== 'offset,rosterHash,scopeHash,v'
      || decoded.v !== 1 || !Number.isSafeInteger(decoded.offset) || decoded.offset < 0
      || typeof decoded.scopeHash !== 'string' || typeof decoded.rosterHash !== 'string'
      || !/^[0-9a-f]{64}$/.test(decoded.scopeHash) || !/^[0-9a-f]{64}$/.test(decoded.rosterHash))
      fail('cron_cursor_invalid', 'Invalid cron list cursor fields.');
    if (decoded.scopeHash !== scopeHash || decoded.rosterHash !== rosterHash || decoded.offset > roster.length)
      fail('cron_cursor_expired', 'Cron scope or roster changed; restart listing without a cursor.');
    offset = decoded.offset;
  }
  const counts = { total: roster.length, pending: 0, calendar: 0, native: 0 };
  for (const row of roster) counts[row.kind]++;
  const result = { scope: 'owner-session', automations: [], pendingCreations: [], count: roster.length,
    counts, pageCount: 0, truncated: false };
  const finish = end => {
    result.pageCount = result.automations.length + result.pendingCreations.length;
    result.truncated = end < roster.length;
    if (result.truncated) result.nextCursor = Buffer.from(JSON.stringify({ v: 1, scopeHash, rosterHash, offset: end })).toString('base64url');
    else delete result.nextCursor;
  };
  let end = offset;
  for (; end < roster.length && result.pageCount < limit; end++) {
    const descriptor = roster[end], data = descriptor.read();
    if (!object(data) || typeof data.then === 'function') fail('cron_page_invalid', 'Cron descriptor read must return a synchronous JSON object.');
    const serialized = JSON.stringify(data);
    if (typeof serialized !== 'string') fail('cron_page_invalid', 'Cron view is not JSON serializable.');
    let row = { ...data, kind: descriptor.kind, id: descriptor.id };
    // Test a row with the full metadata envelope, independently of preceding
    // rows. A genuinely oversized entry must never block all later entries.
    const single = { ...result, automations: descriptor.kind === 'pending' ? [] : [row],
      pendingCreations: descriptor.kind === 'pending' ? [row] : [], pageCount: 1,
      truncated: true, nextCursor: Buffer.from(JSON.stringify({ v: 1, scopeHash, rosterHash, offset: end + 1 })).toString('base64url') };
    if (bytes(single) > MAX_BYTES) {
      row = { kind: descriptor.kind, id: descriptor.id, oversized: true,
        ...(descriptor.kind === 'pending' ? { preparationId: descriptor.id } : {}),
        ...(typeof data.title === 'string' ? { title: data.title.slice(0, 128) } : {}),
        ...(typeof data.status === 'string' ? { status: data.status.slice(0, 128) } : {}),
        jsonSha256: hash(serialized), jsonBytes: Buffer.byteLength(serialized, 'utf8') };
    }
    const target = descriptor.kind === 'pending' ? result.pendingCreations : result.automations;
    target.push(row); finish(end + 1);
    if (bytes(result) > MAX_BYTES) { target.pop(); finish(end); break; }
  }
  finish(end);
  return result;
}
