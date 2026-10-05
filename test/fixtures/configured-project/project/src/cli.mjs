import { readFile, writeFile } from 'node:fs/promises';
import { importTasks } from './tasks.mjs';
const [tasksFile, csvFile] = process.argv.slice(2);
try {
  const existing = JSON.parse(await readFile(tasksFile, 'utf8'));
  const result = importTasks(existing, await readFile(csvFile, 'utf8'));
  await writeFile(tasksFile, JSON.stringify(result.tasks, null, 2) + '\n');
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify({ code: error.code ?? 'IMPORT_FAILED', ...(error.row === undefined ? {} : { row: error.row }) }));
  process.exitCode = 1;
}
