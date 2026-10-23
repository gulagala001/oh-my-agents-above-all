---
name: zcode-workflows
description: Create an explicitly requested ZCode workflow with TypeScript Actors or the native DSH JavaScript facade.
---

Use this skill when the user explicitly chooses a workflow. Size determines the
number of independent tasks, not whether to honor that choice. Keep ordinary
work in the main agent or delegate only independent useful tasks when the user
has not requested a workflow.

For the ZCode Actor facade use `create_workflow`. Supply a TypeScript function
body in `script`, a draft file in `path`, or a named `saved` definition; choose
exactly one source. `agent(name, persona?)` returns a persistent Actor, and
`await actor.ask<T>(instructions)` returns a value checked against the schema
synthesized from `T`. Repeated asks use the same native child conversation and
queue FIFO, including when the host cold-activates that child. Separate Actors
run independently; use Promise.all for independent tasks. An ask without `T`,
or with `T = string`, returns final assistant text, as in the original facade.
Do not mix this API with native `agent(prompt)`.

Typed tasks retain the original result protocol: a JSON string is decoded once
only when its direct value fails the schema; three rejected submissions may be
repaired, and the fourth invalid submission fails with `ValidationFailed`.
If the model ends without submitting, one new native turn asks it to submit;
another omission fails with `ResultNotSubmitted`. Both errors are catchable in
the workflow. These budgets belong to an ask, including its repair and nudge
turns, and reset for the next ask. The same Actor keeps its full conversation;
separate Actors start with separate task contexts. Repair/nudge observations
appear in the existing workflow run panel. Cancellation stops the actual child.

```ts
interface Finding { path: string; summary: string }
phase('Inspect');
const reviewer = agent('reviewer', { system: 'Inspect the requested files without editing.' });
const finding = await reviewer.ask<Finding>('Read the selected module and return one concrete finding.');
report(finding);
const response = await reviewer.ask<string>('Explain that finding using the material you already read.');
return { finding, response };
```

The original compiler typechecks the script, validates facade sites, derives
typed result schemas and lowers its control flow before admission. The script
runs in the native process sandbox; child models, permissions, tools and
transcripts remain DSH-owned. `phase`, `log`, `report` and `args` are available.
Use `files.glob/read/grep` and `git.changedFiles/diff/status/log` for workspace
observations. Globs include hidden and ignored files, skip VCS directories and
do not follow symlinks; grep uses the original ignore rules. Results are complete
or rejected at the original limits, never silently truncated. `world.run(cmd,
argv?, opts?)` takes a literal command name checked by the compiler and runs a
native confined process. Nonzero exit is a result; timeout, cancellation and
incomplete observations reject with a catchable error code. It uses the current
session permissions without escalation. `artifact.file(id, path, opts?)` and
`artifact.markdown(id, content, opts?)` copy content into immutable native
versions and return `{id, version}`. File sources must resolve inside the
workspace, including their real paths. Publication failures can be caught and
corrected; a later successful publication mints the next version. Use
`{primary:true}` on the one deliverable that should lead the run's artifact view.

Declare `artifact.chart/table/metrics/board(id, spec)` at the top level, then
feed a declared dashboard with `report(item, id)`. Field selectors are objects
such as `{field:"score", label:"Score", unit:"ms"}`. Charts use `x` and `y`;
tables use `columns` and an optional row `key`; metrics use `metrics`; boards
use `key`, `status`, `columns` and optional `cardTitle`/`detail`. Repeating an
identical declaration is a no-op. A conflicting or invalid declaration, an
undeclared report tag, or an invalid/over-budget report fails the run; these
synchronous declarations and reports are not catchable publication effects.
Content limits are 32 IDs per run, 16 successful versions per ID, 20 MiB per
file and 256 KiB per Markdown. Reports retain the 256-item/32-KiB-per-item
budget. Published versions remain available after workspace files change.

A background run is a native workflow job with actual
stop/completion behavior. Read the returned job identity and wait for its final
outcome when the user asks you to wait.

A live Actor escalation commits its question before sending a producer notice
to this run's own parent with native nearest-step steering. Read the current
pending facts with `get_workflow_run` and use `resolve_workflow_question` only
for a still-live question. Notice enqueue, claim or request setup is not proof
of an answer. Native steering can wake an idle background-run parent; it cannot
preempt a foreground parent awaiting that same workflow tool. Do not duplicate
or retry a parked question, create another parent, or treat a notice as user
permission approval.

To save this Actor body, set `save_workflow.facade` to `zcode`. Named reuse through
`run_saved_workflow` retains that facade. The default `native` keeps existing
plain JavaScript definitions compatible. The saved source contains a comment
identifying its facade; the YAML metadata and user body remain inspectable.

The following API belongs to the existing native JavaScript `workflow` tool.

The `workflow` tool runs a plain JavaScript function body with top-level await.
End with `return`. Do not include TypeScript annotations, imports, `export meta`,
Node APIs, filesystem calls, timers, or network calls in the script. Working
tools are used by the native child agents. Follow the current tool schema for
`meta`, `args` and `run_in_background`; the current request is the source of
truth for the runtime contract.

The script has `args`, `agent(prompt, options?)`, `parallel(thunks)`,
`pipeline(items, ...stages)`, `phase(title)` and `log(message)`. `agent` returns
the child's final text, or a JSON value when its `schema` option is supplied.
An unsuccessful child returns null. Check every result before depending on it;
do not synthesize a passing value. Independent work can run in parallel;
dependent work awaits its prerequisite. Give each child a complete task with
owned files or responsibility, the available evidence, the expected result and
the actual verification needed. Children share the workspace, so they must
preserve other workers' edits.

For structured results use a JSON object schema, for example:

```js
phase('Inspect');
const findings = await agent(
  'Read the specified files and return concrete findings with file references. Do not edit.',
  { schema: { type: 'object', properties: {
    findings: { type: 'array', items: { type: 'string' } }
  }, required: ['findings'], additionalProperties: false } }
);
if (findings === null) throw new Error('Inspection did not complete');
return findings;
```

The host child uses the structured result tool declared by its actual runtime for a requested schema. Put role-specific expert,
planner, implementation or critic instructions in that child's prompt when
the task benefits from that role. Do not force a fixed team for simple work.
Ground claims in material read or commands run, including the check actually
requested. Report blocked or unsupported outcomes honestly. Do not create
unsolicited report files; when the task names an output path, write there and
return the real path.

Provide meaningful phase titles in meta and call `phase` at those boundaries.
Use `log` for progress the run needs. A background run is a real native job:
retain its returned identity, inspect output with `job_output`, stop it with
`job_kill`, and wait for the native completion notice before declaring success.
Stopping a run stops its native child work. To change a running script, stop
that run and submit the revised script with a new identity; completed findings
can be passed in args.

Check `list_saved_workflows` before rebuilding a reusable workflow. A definition
lives in `.zcode/workflows/<name>.dwf.ts` in the project, or in the same directory
under the user's home for `scope: "global"`. Project definitions win by name.
`read_saved_workflow` returns the metadata and body without executing it;
`run_saved_workflow` reads it once, validates declared JSON arguments, applies
defaults and routes the recorded facade to `create_workflow` or `workflow`.
Use `phases` for native JavaScript metadata; Actor phases belong in the script. Model/API, native jobs, cancellation and permissions remain
those of the current session.

Call `save_workflow` only when the user asks or agrees to save. Supply `name`,
`scope`, `description`, optional `whenToUse` and argument declarations, plus
exactly one body source: `script` or `script_path`. A saved draft file's metadata
block is stripped and the supplied metadata is used. An inline script must be
body only. Syntax errors are returned without writing. The actual write is
performed by the native `write` tool, including its permission and stale-read
checks; this tool does not execute the body while saving.

For metadata-only changes, use `update_saved_workflow` with an explicit scope;
it preserves the current script body. Do not reconstruct old source through
read/save. For an explicitly requested move or deletion, read the explicit
scope first. Pass its COMPLETE `sourceSha256` as `expected_source_sha256`.
`move_saved_workflow` moves only global to project with the same name and refuses
any existing target. `delete_saved_workflow` requires the reviewed scope. Both
retain standing native permissions without escalation. Move is a guarded copy
followed by native Shell unlink; hash/unlink is not cross-process CAS. Require
the actual terminal receipt and readback before claiming completion. Partial or
unknown results, cancellation and promoted jobs may have effects; retain their
call/job identities, re-read the relevant paths, and never automatically retry
or roll back. User request acceptance is not an operation-completion receipt.

A native definition begins with a YAML block comment, followed by the exact
JavaScript body. A ZCode definition also retains its Actor facade marker:

```js
/* zcode-workflow
description: Review the selected module
whenToUse: When this module needs a read-only review
args:
  path: { type: string, required: true }
  limit: { type: number, default: 5 }
*/
const result = await agent('Read ' + args.path + ' and return concrete findings. Do not edit.');
if (result === null) throw new Error('Review did not complete');
return result;
```

Declared types are `string`, finite `number`, `boolean`, or `json` (any JSON
value). Unknown or missing required arguments are reported together; defaults
have the same type checks as supplied values. The `.dwf.ts` extension preserves
the source product's file convention; choose the matching facade when saving
and use that facade's API in the body. Read and edit user-owned
workflow definitions with native file tools before resubmitting.

Use `amend_workflow` when an existing ZCode run needs a correction or another
stage. Pass its `run_id` and a revised `script` or `path`, never both. Do not
stop the predecessor first: the tool typechecks before stopping it, waits for
its native tasks to settle, and starts a successor linked to the original.
Omitted source, name, args and max_concurrency retain their archived values.
Only `run_id` plus `max_concurrency` retunes a live run in place; lowering the
limit does not cancel asks already accepted by native children.

Completed results are matched by unique Actor name, unchanged persona and the
contiguous sequence of instruction hashes. The first changed or new ask is
live and inherits the exact native transcript through the last cached completed
task. Anonymous or changed-persona Actors start fresh. Repeated world operations
match by operation, arguments and occurrence order; a cached `world.run` returns
its prior observation without executing the effect again. Live world commands
close this import window. Native tools without an authoritative effect
classification close it conservatively; after closure only cached asks with no
world tool dispatches remain reusable. Pending predecessor asks are canceled and drained. Actual accepted/admitted
tasks may carry an exactly validated settled aborted transcript into a successor
with a fresh identical prompt. An unbalanced, unadmitted, non-canceled or
effect-closed partial is omitted. Eligibility is checked during selection and
native preparation, not atomically through physical activation. This path does
not revive the original driver or provide same-run journal replay. Runs created before task-prefix metadata was added
must be recreated before they can be amended.

Use `resume_workflow` for an interrupted, failed or stopped run that already
saved the prospective native v3 journal. It keeps the same `run_id` and exact
archived source, args, working directory and resolved model routes. It refuses
a live or superseded run. Legacy v1/v2 archives remain readable; they cannot be
retroactively given replay evidence. Use amendment when changing source or
settings instead.

Resume verifies the whole journal before reopening the archive. Completed
Actor asks require their exact native completed context and acceptance proof.
Running asks, Actor failures without that context, and commands whose complete
external outcome is unknown stop before source execution. No automatic retry
or synthetic transcript repair resolves those cases. Cached successful asks do
not execute their old native tools again. Completed values and eligible saved
failures use the committed global settlement sequence at one common script
delivery gate. This native format is separate from the original engine journal.

Cached report and artifact calls publish no new rows, versions, quota or report
preview events. The returned report preview/count covers newly published
reports in this attempt; the artifact panel retains the full saved run data.
Current DSH models, permissions and sandbox remain authoritative. A verified
journal alone does not prove all external tool or background-job outcomes;
amendment retains its conservative effect-closure refusal.

Live TypeScript workflows also support `await hole<T>(name, prompt?)`. A supplied
body runs locally at its lexical site. An open hole waits; its native job output
and artifact panel identify the waiting site. Use `fill_workflow` with that
`run_id`, `site_id` and TypeScript **body statements**, for example `return value;`.
The original splicer supplies the surrounding async function; do not supply an
outer `async () => { ... }`. The body can refer to bindings at the hole's lexical
site. Load this skill before authoring the body.

The host validates the full revised source, existing sites/schemas/phases and
launch-resolved model routes, saves the effective source and fill facts, updates
native binding tables, then releases waiting occurrences. Filling and amendment
cannot revise the same run concurrently. A stopped or superseded run cannot be
filled; use successor amendment instead. Live fill does not imply crash replay,
and it cannot introduce an unresolved model route. A prospective v3 run also
saves the journal's effective-source ownership in the same fill transaction;
on eligible resume the filled body runs directly at its original lexical site.
