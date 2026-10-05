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
The world-read and artifact-registry facade calls are not connected and receive
diagnostics before execution; give those operations to an Actor using its
native working tools. A background run is a native workflow job with actual
stop/completion behavior. Read the returned job identity and wait for its final
outcome when the user asks you to wait.

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
