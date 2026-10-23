// The token binds the exact displayed text, attachments, source and lane.
// Both browser and Host hash this representation; it is not a second inbox.
export function queueFingerprint(row, target) {
  const canonical = value => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical({ id: row.id, source: row.source, content: row.content, target }));
}
export const queueOrder = rows => JSON.stringify(rows.map(row => row.id));
