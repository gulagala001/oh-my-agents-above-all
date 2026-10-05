---
name: zcode-workflows
description: Create an explicitly requested ZCode workflow with the native DSH JavaScript orchestration runtime.
---

Use this skill when the user explicitly chooses a workflow. Size determines the
number of independent tasks, not whether to honor that choice. Keep ordinary
work in the main agent or delegate only independent useful tasks when the user
has not requested a workflow.

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
can be passed in args. Reusable scripts are ordinary user-owned project files,
read and edited with the native file tools.
