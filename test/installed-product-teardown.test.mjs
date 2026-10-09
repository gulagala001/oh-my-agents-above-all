import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { installedHost, textReply, toolReply, until } from './fixtures/installed-host.mjs';
const text = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');
const result = (page, name) => {
  const call = page.records.findLast(row => row.event?.type === 'tool/call' && row.event.data.name === name)?.event;
  const value = page.records.findLast(row => row.event?.type === 'tool/result' && row.event.data.message?.toolCallId === call?.data.callId)?.event;
  assert(value && !value.data.message.isError, JSON.stringify(value?.data)); return JSON.parse(text(value.data.message));
};
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };
for (const product of ['grok', 'zcode']) for (const action of ['disable', 'uninstall']) {
  test(`${product} in-flight native work drains on bundle ${action}, without late effects`, { timeout: 90000 }, async t => {
    const f = await installedHost(t, { safeEnvironment: true }); await f.install(); await f.boot();
    const { sessionId } = await f.create('omaa-' + product);
    const child = `const fs=require('node:fs');fs.writeFileSync('owned-child.pid',String(process.pid));setTimeout(()=>fs.writeFileSync('late-effect.txt','UNEXPECTED'),8000);`;
    const command = 'node -e ' + "'" + child.replaceAll("'", "'\\''") + "'";
    let sent = false, held = false, release;
    const hold = new Promise(resolve => { release = resolve; }); t.after(() => release());
    f.replyWith(async request => {
      const names = request.tools?.map(tool => tool.function.name) ?? [];
      if (names.includes('submit_result')) { held = true; await hold; return toolReply('submit_result', { value: { ok: true } }); }
      if (product === 'zcode' && names.includes('create_workflow') && !request.messages.some(message => message.role === 'tool' && text(message).includes('The `workflow` tool'))) return toolReply('skill', { name: 'zcode-workflows' });
      if (names.includes(product === 'grok' ? 'monitor' : 'create_workflow') && !sent) {
        sent = true;
        return product === 'grok' ? toolReply('monitor', { command, description: 'Owned lifecycle fixture', persistent: true })
          : toolReply('create_workflow', { script: `interface Result {ok:boolean} phase('In flight'); const worker=agent('held'); const ask=worker.ask<Result>('LIFECYCLE_HOLD'); const proc=world.run('node',['-e',${JSON.stringify(child)}]); await Promise.all([ask,proc]); return {ok:true};`, run_in_background: true });
      }
      return textReply('Native work started.');
    });
    const page = await f.prompt(sessionId, 'LIFECYCLE_OWNED_WORK');
    const started = result(page, product === 'grok' ? 'monitor' : 'create_workflow');
    if (product === 'zcode') assert(started.ok && started.runId && started.jobId, JSON.stringify(started));
    const pid = await until(async () => { try { return Number(await readFile(join(f.workspace, 'owned-child.pid'), 'utf8')); } catch { return false; } });
    assert(Number.isSafeInteger(pid) && pid > 1 && alive(pid), 'owned child really started');
    if (product === 'zcode') await until(() => held);
    const mutation = action === 'disable'
      ? await f.call('pluginManager/setBundleEnabled', { name: 'oh-my-agents-above-all', enabled: false })
      : await f.call('pluginManager/removeBundle', { name: 'oh-my-agents-above-all' });
    if (action === 'disable') {
      assert(['applied', 'restart-required'].includes(mutation.application), JSON.stringify(mutation));
      if (mutation.application === 'applied') await until(() => !alive(pid), 5000);
    } else {
      if (mutation.application === 'applied') {
        assert.equal(mutation.changed, true);
        await until(() => !alive(pid), 5000);
      } else {
        assert.equal(mutation.application, 'failed', JSON.stringify(mutation));
        assert.equal(mutation.error?.code, 'stop-profile', 'honor the native stop-before-removal boundary');
        assert.equal(mutation.changed, false);
      }
    }
    await f.stop(); release();
    await until(() => !alive(pid), 5000);
    await assert.rejects(access(join(f.workspace, 'late-effect.txt')), { code: 'ENOENT' });
    if (action === 'uninstall' && mutation.application !== 'applied') await f.uninstall();
    await f.boot();
    const standard = await f.create('standard'); f.replyWith(() => textReply('Native base remains available.'));
    await f.prompt(standard.sessionId, 'LIFECYCLE_NATIVE_BASE_RESTORED');
    const response = await fetch(f.origin + '/omaa/api/session?session=' + standard.sessionId, { headers: { cookie: f.cookie } });
    assert.equal(response.status, 404);
    if (action === 'disable') {
      await f.stop(); await f.bundleEnabled(true); await f.boot();
      assert.equal((await f.api(sessionId)).status, 200);
      if (product === 'zcode') {
        const detail = await fetch(f.origin + '/omaa/api/zcode-workflow?session=' + sessionId + '&run=' + started.runId, { headers: { cookie: f.cookie } }).then(response => response.json());
        assert(['aborted', 'interrupted', 'failed', 'cancelled', 'killed'].includes(detail.status), JSON.stringify(detail));
      }
    }
    await delay(200); assert(!alive(pid));
    await assert.rejects(access(join(f.workspace, 'late-effect.txt')), { code: 'ENOENT' });
    assert.deepEqual(f.errors, []);
    const directory = process.env.OMAA_TEARDOWN_EVIDENCE_DIR ?? 'work/rea-upgrade/product-teardown';
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${f.evidence.version}-${product}-${action}.json`), JSON.stringify({ host: f.evidence.version, product, action, mutation, started, pid, childExited: !alive(pid), noLateEffect: true, nativeBaseRestored: true, platform: process.platform,
      limits: 'Native bundle application and required host restart; no assertion of unsupported hot-reload. Isolated local provider and owned process, not real accounts/desktop.' }, null, 2) + '\n');
  });
}
