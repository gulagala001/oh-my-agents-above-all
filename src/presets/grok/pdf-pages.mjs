// Port of fixed read_file/pdf.rs parse_page_range; count comes from the real
// renderer, never from a filename, guessed catalogue or model response.
export function parsePdfPages(spec, count) {
  const selected = new Set();
  const number = value => {
    if (!/^\+?\d+$/.test(value)) throw Error(`invalid page number: '${value}'`);
    const n = Number(value); if (!Number.isSafeInteger(n)) throw Error(`invalid page number: '${value}'`);
    return n;
  };
  for (const raw of spec.split(',')) {
    const part = raw.trim(); if (!part) continue;
    const dash = part.indexOf('-');
    const first = number((dash < 0 ? part : part.slice(0, dash)).trim());
    if (first < 1 || first > count) throw Error(`page ${first} out of range (document has ${count} pages)`);
    const tail = dash < 0 ? undefined : part.slice(dash + 1).trim();
    const last = dash < 0 ? first : tail === '' ? count : number(tail);
    if (first > last) throw Error(`invalid page range: ${first}-${last} (start must be ≤ end)`);
    for (let p = first; p <= Math.min(last, count); p++) {
      selected.add(p);
      if (selected.size > 20) throw Error('requested more than 20 pages, maximum is 20 per call');
    }
  }
  if (!selected.size) throw Error('no pages specified');
  return [...selected].sort((a, b) => a - b);
}
