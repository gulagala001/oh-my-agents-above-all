import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extractPiTheme } from '../scripts/extract-pi-theme.mjs';
const root=new URL('../src/client/themes/sources/pi/',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(name,root),'utf8'));
test('Pi theme snapshots retain official pinned version, source hashes and both MIT notices',async()=>{
 const provenance=await read('provenance.json');assert.equal(provenance.version,'1.0.2');assert.equal(provenance.commit,'cd32f7725fdbddbaecdff5b1e68491563394e0ca');assert.equal(provenance.repository,'https://github.com/earendil-works/pi');
 for(const source of provenance.sources){const bytes=await readFile(new URL(source.snapshot,root));assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256,source.path);}
 assert.match(await readFile(new URL('LICENSE',root),'utf8'),/Copyright \(c\) 2025 Mario Zechner/);assert.match(await readFile(new URL('upstream/oklab.ts.txt',root),'utf8'),/Copyright \(c\) 2021 Björn Ottosson/);
});
test('Pi palette is reproducible with upstream OKHSL parser and complete fixed-theme role coverage',async()=>{
 const stored=await read('palette.json'), regenerated=await extractPiTheme();assert.deepEqual(regenerated,stored);
 for(const variant of ['dark','light']){const raw=await read('upstream/'+variant+'.json'),palette=stored.variants[variant].palette;assert.equal(Object.keys(palette).length,Object.keys(raw.colors).length+Object.keys(raw.export).length);for(const [token,value]of Object.entries(raw.colors)){assert.equal(palette[token].rawValue,value);assert.match(palette[token].browserValue,/^#[0-9a-f]{6}$/);assert.ok(palette[token].sourceLine>0);}}
 assert.equal(stored.variants.dark.palette.accent.browserValue,'#a798d7');assert.equal(stored.variants.light.palette.accent.browserValue,'#7459b4');assert.equal(stored.variants.dark.palette.error.browserValue,'#ea7f81');assert.equal(stored.variants.light.palette.userMessageBg.browserValue,'#dfe7ec');assert.equal(stored.nativeSelection.default,'system');assert.equal(stored.nativeSelection.defaultIsDynamic,true);
});
test('Pi role candidates reference actual tokens and disclose HTML/terminal/geometry boundaries',async()=>{
 const roles=await read('role-candidates.json'),palette=await read('palette.json');for(const variant of ['dark','light'])for(const token of Object.values(roles.roles))assert.ok(palette.variants[variant].palette[token],token);
 assert.equal(roles.status,'mapping-candidates-only');assert.match(roles.limits.canvas,/not proof of terminal/);assert.match(roles.limits.assistant,/no filled message background/);assert.match(roles.limits.geometry,/host adaptations/);
});
