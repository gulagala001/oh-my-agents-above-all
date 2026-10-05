export function parseCsv(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => line.split(',').map(value => value.trim()));
}
