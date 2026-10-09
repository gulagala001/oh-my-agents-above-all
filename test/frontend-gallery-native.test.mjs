import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { installedHost, textReply, toolReply, until } from './fixtures/installed-host.mjs';
import { products } from '../src/shared/products.mjs';

const execute = promisify(execFile), sha = value => createHash('sha256').update(value).digest('hex');
async function chromeRegistrationHashes() {
  if (process.platform !== 'darwin') return { platform: process.platform };
  const directory = '/Users/mac/Library/Application Support/Google/Chrome/NativeMessagingHosts';
  const entries = await readdir(directory).catch(error => { if (error.code === 'ENOENT') return []; throw error; }), files = {};
  for (const name of entries.sort()) { const path = join(directory, name), info = await stat(path); if (info.isFile()) files[name] = { sha256: sha(await readFile(path)), mode: info.mode & 0o777, size: info.size }; }
  return files;
}

test('Native five-product gallery preserves credentials and explains actual non-Git 400 without changing review behavior', { timeout: 180000, skip: !process.env.OMAA_TEST_HOST_PACKAGE && 'An explicit frozen matching package is required.' }, async t => {
  const directory = resolve(process.env.OMAA_GALLERY_EVIDENCE_DIR || 'work/rea-upgrade/frontend-015/git-error/native-gallery');
  await mkdir(directory, { recursive: true });
  let f, browser, page, verified = false; const errors = [], captures = [], checks = [];
  const globalBefore = await chromeRegistrationHashes();
  t.after(async () => {
    if (page && !page.isClosed()) { await page.screenshot({ path: join(directory, verified ? 'final.png' : 'failure.png'), fullPage: true }); }
    await browser?.close();
    const globalAfter = await chromeRegistrationHashes(); assert.deepEqual(globalAfter, globalBefore, 'Readonly real Chrome registration guard');
    await writeFile(join(directory, 'verification.json'), JSON.stringify({ verified, checks, captures, errors, globalChromeUnchanged: true, fixture: f?.evidence, scope: 'Actual official Web SDK, owned HOME and synthetic local model/CFT. Full Native page captures, no marketing mockup or real account/hardware action.' }, null, 2) + '\n');
  });
  f = await installedHost(t, { safeEnvironment: true });
  t.after(async () => { await assert.rejects(access(f.root), { code: 'ENOENT' }); assert(f.evidence.cleanup.rootRemoved); assert(f.evidence.cleanup.stopReceipts.every(row => !row.forced)); await writeFile(join(directory, 'cleanup.json'), JSON.stringify(f.evidence.cleanup, null, 2) + '\n'); });
  if (process.env.OMAA_TEST_HOST_PACKAGE_SHA256) assert.equal(f.evidence.artifact.sha256, process.env.OMAA_TEST_HOST_PACKAGE_SHA256);
  await f.install(); assert.deepEqual(await f.exemptions(), {}); await f.boot();
  const sdk = await f.installedEvidence(); for (const [name,row] of Object.entries(sdk.sdk)) { assert.equal(row.pluginVersion,row.hostVersion,name); assert.equal(row.pluginPath,row.hostPath,name); assert.equal(row.pluginModule,row.hostModule,name); }
  assert.deepEqual(sdk.linkedRoots, []); await writeFile(join(directory, 'installed-sdk.json'), JSON.stringify(sdk, null, 2) + '\n');
  const credentialBefore = await readFile(join(f.home,'.credentials.yaml'));
  const workspace = await f.rpc('workspace/create',{path:f.workspace}), ids = {};
  await writeFile(join(f.workspace, 'example.txt'), 'Owned example input.\n');
  for (const product of products) {
    const {sessionId} = await f.rpc('session/create',{workspaceId:workspace.workspace.workspaceId,agentPreset:product.preset}); ids[product.id] = sessionId;
    let step=0; f.replyWith(payload => payload.tools?.length && step++ === 0 ? toolReply('read',{file_path:'example.txt'}) : textReply('The example file is readable. The native session is ready to continue.'));
    const history = await f.prompt(sessionId,'Read example.txt and report its status.'); assert(history.records.some(row => row.event?.type === 'tool/result' && !row.event.data.message?.isError));
    f.replyWith(); await f.rpc('session/rename',{sessionId,title:product.name+' · example'});
  }
  const response = await fetch(f.origin+'/omaa/api/git-review?'+new URLSearchParams({session:ids.codex,scope:'unstaged'}),{headers:{cookie:f.cookie}});
  assert.equal(response.status,400); const diagnostic=await response.json(); assert.equal(diagnostic.code,'GIT_FAILED'); assert.match(diagnostic.error,/^fatal: not a git repository/);
  browser = await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
  const context = await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light'});
  await context.addCookies(f.cookie.split('; ').map(value=>{const at=value.indexOf('=');return{name:value.slice(0,at),value:value.slice(at+1),url:f.origin}}));
  page=await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror',error=>errors.push(error.message));
  await page.goto(f.origin); await page.getByRole('button',{name:/^(Continue|继续)$/,exact:true}).click();
  for (const product of products) {
    await page.getByText(product.name+' · example',{exact:true}).first().click(); await page.locator(`html[data-omaa-theme="${product.theme}"]`).waitFor();
    await page.getByRole('button',{name:product.name+' 预设设置',exact:true}).click();
    const panel=page.getByRole('region',{name:'Oh My Agents Above All 预设设置',exact:true});
    await until(async()=>await panel.getByLabel('会话主题',{exact:true}).isEnabled());
    if(product.id==='codex'){
      const review=page.getByRole('region',{name:'Codex Git 审阅'}); await review.getByText('当前目录不属于 Git 仓库；选择仓库后审阅。',{exact:true}).waitFor();
      await review.getByText('原始 Git 诊断',{exact:true}).click(); assert.equal(await review.locator('details pre').innerText(),diagnostic.error);
      await page.screenshot({path:join(directory,'codex-non-git-expanded.png'),fullPage:true}); await review.getByText('原始 Git 诊断',{exact:true}).click();
      const requestCount=f.requests.length; await review.getByRole('button',{name:'刷新',exact:true}).click(); await review.getByText('当前目录不属于 Git 仓库；选择仓库后审阅。',{exact:true}).waitFor();
      assert.equal(f.requests.length,requestCount,'Review refresh invokes no model request'); checks.push({nativeNonGitStatus:400,code:diagnostic.code,originalDiagnosticExact:true,modelRequestsFromRefresh:0});
    }
    for (const appearance of ['light','dark']) {
      await panel.getByLabel('明暗模式',{exact:true}).selectOption(appearance); await page.locator(`html[data-appearance="${appearance}"]`).waitFor();
      await until(async()=>await panel.getByLabel('明暗模式',{exact:true}).isEnabled() && await panel.getByLabel('明暗模式',{exact:true}).inputValue()===appearance);
      const filename=product.id+'-'+appearance+'.png'; await page.screenshot({path:join(directory,filename),fullPage:true}); const bytes=await readFile(join(directory,filename));
      captures.push({product:product.id,appearance,filename,sha256:sha(bytes),viewport:{width:1440,height:1000},omaa:f.evidence.artifact.version,host:f.evidence.version});
    }
  }
  await execute('git',['init'],{cwd:f.workspace});
  await page.getByText('Codex · example',{exact:true}).first().click(); await page.getByRole('button',{name:'Codex 预设设置',exact:true}).click();
  const review=page.getByRole('region',{name:'Codex Git 审阅'}); await review.getByRole('button',{name:'刷新',exact:true}).click(); await review.getByRole('button',{name:'example.txt',exact:true}).waitFor();
  assert.equal(await review.getByRole('alert').count(),0); const valid=await fetch(f.origin+'/omaa/api/git-review?'+new URLSearchParams({session:ids.codex,scope:'unstaged'}),{headers:{cookie:f.cookie}}); assert.equal(valid.status,200); assert.equal((await valid.json()).total,1);
  checks.push({sameWorkspaceRealGitInit:true,nativeReviewStatus:200,errorCleared:true});
  assert.deepEqual(await readFile(join(f.home,'.credentials.yaml')),credentialBefore); assert.deepEqual(await f.exemptions(),{}); assert.deepEqual(errors,[]); assert.deepEqual(f.errors,[]); verified=true;
  await writeFile(join(directory,'credential-protection.json'),JSON.stringify({postFirstBootSha256:sha(credentialBefore),finalSha256:sha(await readFile(join(f.home,'.credentials.yaml'))),strictBytesExact:true},null,2)+'\n');
});
