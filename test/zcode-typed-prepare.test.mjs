import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWorkflowScript, analyzeWorkflowProgram, createWorkflowProgram } from '../lib/zcode-workflow-compiler.mjs';
import { prepareTypedWorkflow } from '../src/presets/zcode/typed-compiler.mjs';
import { prepareTypedWorkflow as prepareLazy } from '../src/presets/zcode/typed-prepare.mjs';

test('shared workflow Program retains the public analysis and rejects invalid scripts', () => {
  for (const script of [
    'return 1;',
    "const a=agent('Reviewer'); return await a.ask<string>('review');",
    "return await world.run('pwd', []);",
    "const command=args.command; return await world.run(command as string, []);",
    "const a=agent('Same'); const b=agent('Same'); return 1;",
    "const value:number='wrong'; return value;",
    "return await fetch('https://example.com');",
  ]) {
    const analysis=analyzeWorkflowScript(script);
    assert.deepEqual(analyzeWorkflowProgram(createWorkflowProgram(script)),analysis);
    const prepared=prepareTypedWorkflow(script);
    assert.equal(prepared.ok,analysis.ok);
    if(!analysis.ok)assert.deepEqual(prepared.diagnostics.map(value=>value.code),analysis.diagnostics.map(value=>value.code));
  }
});

test('preparation keeps schemas, command sets and lowering local to each script', () => {
  const first=prepareTypedWorkflow("interface Fact {value:string} const a=agent('Reader'); return await a.ask<Fact>('fact');");
  const command=prepareTypedWorkflow("return await world.run('pwd', []);");
  const second=prepareTypedWorkflow("interface Fact {value:number} const a=agent('Reader'); return await a.ask<Fact>('fact');");
  assert.ok(first.ok&&command.ok&&second.ok);
  assert.notDeepEqual(first.askSpecs,second.askSpecs);
  assert.deepEqual([...first.declaredRunCommands],[]);
  assert.deepEqual([...command.declaredRunCommands],['pwd']);
  assert.deepEqual([...second.declaredRunCommands],[]);
  const again=prepareTypedWorkflow(first.script);
  assert.deepEqual(again.askSpecs,first.askSpecs); assert.deepEqual(again.lowered,first.lowered);
  assert.deepEqual(again.graph,first.graph);
});

test('lazy preparation preserves independent results and refuses invalid or cancelled input', async () => {
  const scripts = ['return 1;', "const value:number='wrong';return value;"];
  const values = await Promise.all(scripts.map(script => prepareLazy(script)));
  for (let index = 0; index < scripts.length; index++) {
    const current = values[index], expected = prepareTypedWorkflow(scripts[index]);
    assert.equal(current.ok, expected.ok); assert.deepEqual(current.diagnostics, expected.diagnostics);
    if (current.ok) {
      assert.deepEqual(current.askSpecs, expected.askSpecs); assert.deepEqual(current.lowered, expected.lowered);
      assert.deepEqual(current.graph, expected.graph); assert.deepEqual(current.declaredRunCommands, expected.declaredRunCommands);
    }
  }
  await assert.rejects(prepareLazy(null), /at most 256 KiB/);
  await assert.rejects(prepareLazy('中'.repeat(100000)), /at most 256 KiB/);
  const aborter = new AbortController(); aborter.abort(Error('cancelled preparation'));
  await assert.rejects(prepareLazy('return 1;', aborter.signal), /cancelled preparation/);
});
