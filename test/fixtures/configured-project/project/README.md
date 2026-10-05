# Task CSV importer

This small Node.js project imports a CSV into a task list. It currently has a known atomicity defect and lacks robust CSV, priority and dry-run support. Complete these requirements without changing existing tests or using dependencies.

## Public API

`parseCsv(text)` in `src/csv.mjs` returns an array of record arrays, including the header. Support UTF-8 BOM, LF/CRLF, comma-separated fields, quoted commas, `""` escaped quotes, and newlines inside quoted fields (normalize CRLF to LF). Ignore empty records between/after records. Malformed quoting throws an Error with `code: "INVALID_CSV"`. No requirement for other delimiters.

`importTasks(existing, csv, {dryRun = false} = {})` in `src/tasks.mjs` returns `{tasks, added, updated}`. Both normal and dry-run calls are pure: never change the original array, its tasks, or their extra fields. Returned tasks are the complete preview/result; dry-run does not alter counts or preview semantics.

CSV must have id,title,status headers exactly once, with optional priority, in any order. Unknown/duplicate/missing headers are `INVALID_HEADER`, `row:1`.

Trim id/title/status/priority values. id and title must be nonempty. status is exactly `todo` or `done`, stored as `done:false/true`. If priority is supplied, valid nonempty values are `low`, `normal`, `high`. Blank/absent priority preserves an existing task's priority (default normal when none), or uses normal for a new task.

Upsert by id. Preserve original task order and all extra fields; append new tasks in CSV record order. `added` counts new ids, `updated` counts records matching an existing id (even when values are unchanged).

Duplicate ids in the CSV throw `DUPLICATE_ID`; missing required values, wrong column count, bad status/priority throw `INVALID_ROW`. Those errors include `row`, defined as the logical CSV record number: header=1, first data record=2, independent of physical lines inside quoted fields. On any error, reject the whole import and leave all original input objects unchanged.

## CLI

`node src/cli.mjs <tasks.json> <import.csv> [--dry-run]`

Normal success writes the resulting task array to tasks.json and prints JSON `{tasks,added,updated}` to stdout. `--dry-run` prints the same preview, but tasks.json bytes must remain unchanged. Validation errors exit nonzero, print JSON `{code,row}` to stderr (row omitted only when unavailable), and leave tasks.json bytes unchanged. Read/validate the whole import before writing. The CLI has no network or account functionality.

## Verification

Run `npm test` for the original tests and any tests you add. `fixtures/basic.csv` and `fixtures/tasks.json` are examples, not files to overwrite during tests.
