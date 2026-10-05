import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, truncate, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { installedHost, toolReply, textReply } from './fixtures/installed-host.mjs';
import { parseArtifactPresetSpec } from '../lib/zcode-artifact-ui-spec.mjs';
import { applyArtifactItems } from '../lib/zcode-artifact-ui-apply.mjs';
const textOf = message => typeof message.content === 'string' ? message.content : (message.content ?? []).map(part => part.text ?? '').join('\n');

test('ZCode artifacts persist native immutable versions, original dashboards and catchable/fatal failures', { timeout: 90000 }, async t => {
  const f = await installedHost(t);
  await writeFile(join(f.workspace, 'deliverable.txt'), 'VERSION_ONE');
  await writeFile(join(f.workspace, 'large.bin'), ''); await truncate(join(f.workspace, 'large.bin'), 20 * 1024 * 1024 + 1);
  await writeFile(join(f.root, 'outside.txt'), 'OUTSIDE'); await symlink(join(f.root, 'outside.txt'), join(f.workspace, 'escape.txt'));
  await f.install(); await f.boot();
  const { sessionId } = await f.create('omaa-zcode');
  const api = async (name, params, binary = false) => {
    const response = await fetch(f.origin + '/omaa/api/' + name + '?' + new URLSearchParams({ session: sessionId, ...params }), { headers: { cookie: f.cookie } });
    const value = binary ? await response.text() : await response.json();
    assert.equal(response.status, 200, JSON.stringify(value)); return value;
  };
  let body, stage = 0;
  f.replyWith(request => {
    if (!request.tools?.length) return textReply('Fixture complete.');
    if (stage++ === 0) return toolReply('skill', { name: 'zcode-workflows' });
    if (stage === 2) return toolReply('create_workflow', { script: body, run_in_background: false });
    return textReply('Collected actual workflow result.');
  });
  const execute = async script => {
    body = script; stage = 0;
    const result = await f.prompt(sessionId, 'Use a workflow for this artifact fixture: ' + crypto.randomUUID());
    const call = result.records.findLast(row => row.event?.type === 'tool/call' && row.event.data.name === 'create_workflow').event;
    const outcome = result.records.find(row => row.event?.type === 'tool/result' && row.event.data.message?.toolCallId === call.data.callId)?.event;
    assert(outcome, 'Actual workflow tool result is missing'); return JSON.parse(textOf(outcome.data.message));
  };
  const outcome = await execute(`artifact.table('table', {columns:[{field:'name'},{field:'value'}],key:'name'});
const snapshotSpec = {columns:[{field:'name'}]}; artifact.table('snapshot',snapshotSpec); snapshotSpec.columns.length=0;
artifact.metrics('metrics', {metrics:[{field:'value'}]});
artifact.board('board', {key:'name',status:'status',columns:['todo','done'],cardTitle:'name'});
artifact.chart('chart', {x:{field:'x'},y:{field:'value'},type:'line'});
report({name:'one',value:1,x:1,status:'todo'},'table');
report({name:'one',value:2,x:2,status:'done'},'table');
report({value:2},'metrics'); report({name:'one',status:'done'},'board'); report({x:2,value:2},'chart');
report('An untagged result');
const first = await artifact.file('deliverable','deliverable.txt',{primary:true,title:'Deliverable'});
await world.run('node',['-e','require("node:fs").writeFileSync("deliverable.txt","VERSION_TWO")']);
const second = await artifact.file('deliverable','deliverable.txt');
const markdown = await artifact.markdown('notes','# Immutable notes');
let cap='',outside='',missing='',primary='';
try { await artifact.file('oversize','large.bin'); } catch(error) { cap=(error as {code:string}).code; }
try { await artifact.file('escape','escape.txt'); } catch(error) { outside=(error as {code:string}).code; }
try { await artifact.file('missing','missing.txt'); } catch(error) { missing=(error as {code:string}).code; }
try { await artifact.markdown('other','# Other',{primary:Object.keys(args).length===0}); } catch(error) { primary=(error as {code:string}).code; }
return {first,second,markdown,cap,outside,missing,primary};`);
  assert(outcome.ok, JSON.stringify(outcome));
  assert.deepEqual(outcome.value.first, { id: 'deliverable', version: 1 });
  assert.deepEqual(outcome.value.second, { id: 'deliverable', version: 2 });
  assert.deepEqual([outcome.value.cap, outcome.value.outside, outcome.value.missing, outcome.value.primary], ['ArtifactTooLarge', 'ArtifactPathOutsideWorkspace', 'ArtifactSourceMissing', 'ArtifactPrimaryConflict']);
  await writeFile(join(f.workspace, 'deliverable.txt'), 'WORKSPACE_CHANGED');
  const detail = await api('zcode-workflow', { run: outcome.runId });
  assert.equal(detail.artifacts.find(value => value.id === 'snapshot').spec.columns.length, 1);
  assert.equal(detail.status, 'completed'); assert.equal(detail.artifacts[0].id, 'deliverable'); assert.equal(detail.artifacts[0].primary, true);
  assert.equal(await api('zcode-artifact-content', { run: outcome.runId, id: 'deliverable', version: '1' }, true), 'VERSION_ONE');
  assert.equal(await api('zcode-artifact-content', { run: outcome.runId, id: 'deliverable', version: '2' }, true), 'VERSION_TWO');
  const table = detail.artifacts.find(value => value.id === 'table');
  const page = await api('zcode-artifact-data', { run: outcome.runId, id: 'table', limit: '1', after: '0' });
  assert.equal(page.hasMore, true);
  const next = await api('zcode-artifact-data', { run: outcome.runId, id: 'table', after: String(page.cursor) });
  const folded = applyArtifactItems('table', parseArtifactPresetSpec('table', table.spec), [...page.items, ...next.items]);
  assert.equal(folded.rows.length, 1); assert.equal(folded.rows[0].cells[1], '2');
  const preview = await api('zcode-artifact-preview', { run: outcome.runId, id: 'notes', version: '1' });
  assert(preview.resource.startsWith('dsh-resource://file/session/'));
  const other = await f.create('omaa-zcode');
  const denied = await fetch(f.origin + '/omaa/api/zcode-artifact-content?' + new URLSearchParams({ session: other.sessionId, run: outcome.runId, id: 'deliverable', version: '1' }), { headers: { cookie: f.cookie } });
  assert.equal(denied.status, 400);
  const before = (await f.snapshot(sessionId)).projections.asOfSeq;
  await f.stop(); await f.boot();
  assert.equal(await api('zcode-artifact-content', { run: outcome.runId, id: 'deliverable', version: '1' }, true), 'VERSION_ONE');
  assert.equal((await api('zcode-workflow', { run: outcome.runId })).status, 'completed');
  assert.equal((await f.snapshot(sessionId)).projections.asOfSeq, before, 'Archived artifact reads must not append to the native session');
  const failed = await execute(`artifact.table('bad',{columns:[] as any}); return 'This must not be a successful run';`);
  assert.equal(failed.ok, false); assert.equal(failed.error.code, 'ArtifactSpecInvalid');
  assert.equal((await api('zcode-workflow', { run: failed.runId })).status, 'failed');
  assert.deepEqual(f.errors, []);
});
