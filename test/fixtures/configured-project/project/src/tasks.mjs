import { parseCsv } from './csv.mjs';
export function importTasks(existing, csv, options = {}) {
  const [header, ...records] = parseCsv(csv);
  let added = 0, updated = 0;
  for (const [index, record] of records.entries()) {
    const values = Object.fromEntries(header.map((key, i) => [key, record[i]]));
    let task = existing.find(entry => entry.id === values.id);
    if (task) { task.title = values.title; updated++; }
    else { task = { id: values.id, title: values.title }; existing.push(task); added++; }
    if (!['todo', 'done'].includes(values.status)) {
      const error = new Error('Invalid status'); error.code = 'INVALID_ROW'; error.row = index + 2; throw error;
    }
    task.done = values.status === 'done';
  }
  return { tasks: existing, added, updated };
}
