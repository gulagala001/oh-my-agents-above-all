// Boundary for the original ZCode material selector. Native Session events are
// converted by session-context.mjs; there is no second history store or loop.
export const activeSessionMessages = messages => messages;
export function dedupeParts(parts) {
  const seen = new Set();
  return parts.filter(part => { const key = JSON.stringify(part); if (seen.has(key)) return false; seen.add(key); return true; });
}
export function formatPartForContext(part) { return part.type === 'text' ? part.text : undefined; }
export function truncateText(text, budget) {
  if (text.length <= budget) return text;
  return text.slice(0, Math.max(0, budget - 18)) + '\n...[truncated]';
}
