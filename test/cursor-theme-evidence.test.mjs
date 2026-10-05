import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {observeStartupAnsi} from '../src/client/themes/sources/cursor/ansi-observation.mjs';
const root=new URL('../src/client/themes/sources/cursor/',import.meta.url);
test('fixed CLI logged-out captures preserve native SGR and terminal-inherited roles',async()=>{
  const provenance=JSON.parse(await readFile(new URL('provenance.json',root)));
  const dark=await readFile(new URL('captures/logged-out-dark.ansi',root)),light=await readFile(new URL('captures/logged-out-light.ansi',root));
  assert.equal(provenance.runtime.version,'2026.10.01-e373342');
  assert.equal(createHash('sha256').update(dark).digest('hex'),'4027d49034dc07a0ba947bc214f1e7bf7fb3debf3c6153dc9d0ecb33e2e85c47');
  assert.deepEqual(dark,light);assert.equal(dark.length,363);
  const parsed=observeStartupAnsi(dark.toString());
  assert.equal(parsed.unsupported.length,0);assert.deepEqual(parsed.sgr,['0','1','2','22','32','36','39']);
  assert.deepEqual(parsed.spans.map(x=>[x.row,x.column,x.foreground,x.bold,x.dim]),[[15,37,'default',true,false],[16,37,'default',false,true],[17,37,'ansi-2',false,false]]);
  assert.equal(parsed.spans[1].text,'v2026.10.01-e373342');
  assert.deepEqual(provenance.fixedProductRgbPalette,[]);assert.ok(provenance.roleObservations.every(role=>role.browserValue===null));
});
test('terminal measurement does not promote unqueried emulator colors to native palette',async()=>{
  const measurement=JSON.parse(await readFile(new URL('measurement.json',root)));
  assert.equal(measurement.authenticationInputSent,false);assert.equal(measurement.networkDenied,true);assert.equal(measurement.keychainDenied,true);
  assert.equal(measurement.results.length,2);
  assert.ok(measurement.results.every(result=>result.terminalQueryReplies.length===0));
  for(const result of measurement.results){const data=await readFile(new URL(`captures/logged-out-${result.variant}.ansi`,root));assert.equal(createHash('sha256').update(data).digest('hex'),result.sha256);}
});
