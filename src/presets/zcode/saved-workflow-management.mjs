import { createHash, randomUUID } from 'node:crypto';
import { currentDirectory } from '../../host/working-directory.mjs';
import { isValidSavedWorkflowName } from '../../../lib/zcode-saved-contract.mjs';

const MAX_BYTES = 256 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const bashQuote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
const pwshQuote = value => "'" + value.replaceAll("'", "''") + "'";
const hashSchema = { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'Full source-byte SHA256 from a fresh read_saved_workflow, including metadata.' };

export async function readSavedWorkflowSnapshot(ctx, exec, saved) {
  const bytes = await ctx.fs.readBytes(saved.target, exec.signal, MAX_BYTES);
  const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const after = await ctx.fs.stat(saved.target, exec.signal);
  // Native fs-local streamText strips the initial UTF-8 BOM. Keep the exact
  // raw source for hash/copy, allowing only that documented decoding difference.
  const sameSource = source === saved.source || (source.startsWith('\uFEFF') && source.slice(1) === saved.source);
  if (!after || after.type !== 'file' || after.version !== saved.version || !sameSource)
    throw Error('Saved workflow changed while reading; refresh its source.');
  return { ...saved, source, sourceSha256: hash(bytes) };
}

// A name alone is insufficient: persistent shells use different schemas and
// prose output. Only the public ordinary native foreground DTO is supported.
function ordinaryShell(definition) {
  const p = definition?.parameters, required = p?.required ?? [];
  if (p?.type !== 'object' || !['command', 'description'].every(key => required.includes(key) && p.properties?.[key]?.type === 'string')
    || p.properties?.timeoutMs?.type !== 'number' || p.properties?.workdir?.type !== 'string') return false;
  const foreground = definition.output?.schema?.oneOf?.find(arm => arm.properties?.kind?.const === 'foreground');
  return foreground?.type === 'object' && ['kind', 'exitCode', 'signal', 'timedOut', 'aborted', 'stdout', 'stderr']
    .every(key => foreground.required?.includes(key)) && foreground.properties.stdout?.type === 'object';
}

function chooseShell(ctx, exec, paths) {
  if (paths.some(path => typeof path !== 'string' || path.includes('\0')
    || (!path.startsWith('/') && !/^(?:[A-Za-z]:[\\/]|\\\\)/.test(path))))
    throw Error('Native provider did not expose absolute execution-world file paths.');
  const names = paths.some(path => /^(?:[A-Za-z]:[\\/]|\\\\)/.test(path)) ? ['pwsh'] : ['bash', 'pwsh'];
  for (const name of names) {
    const definition = ctx.tools.get(name, exec.agent);
    if (ordinaryShell(definition)) return { name, definition };
  }
  throw Error('A compatible ordinary native Shell tool is unavailable; no saved file was changed.');
}

// These are command builders only. They are never executed during builds.
// Digest comparison followed by unlink is deliberately NOT cross-process CAS.
function unlinkCommand(name, source, destination, expected, operationId, action) {
  const receipt = (state, reason) => JSON.stringify({ format: 'omaa-saved-unlink-v1', operationId, action, state, reason });
  if (name === 'bash') {
    const emit = (state, reason, code) => `printf '%s\\n' ${bashQuote(receipt(state, reason))}; exit ${code}`;
    const check = (variable, reason) => `if [[ ! -f "$${variable}" || -L "$${variable}" ]]; then ${emit('refused', reason, 20)}; fi
if ! omaa_digest=$(omaa_hash "$${variable}"); then ${emit('refused', 'hash-read-failed', 21)}; fi
if [[ "$omaa_digest" != "$omaa_expected" ]]; then ${emit('refused', reason + '-digest-changed', 22)}; fi`;
    return `set -u
omaa_source=${bashQuote(source)}
omaa_expected=${bashQuote(expected)}
${destination ? `omaa_destination=${bashQuote(destination)}` : ''}
if command -v sha256sum >/dev/null 2>&1; then
  omaa_hash() { local out; out=$(command sha256sum < "$1") || return; printf '%s' "\${out%% *}"; }
elif command -v shasum >/dev/null 2>&1; then
  omaa_hash() { local out; out=$(command shasum -a 256 < "$1") || return; printf '%s' "\${out%% *}"; }
else
  ${emit('refused', 'sha256-utility-unavailable', 23)}
fi
${check('omaa_source', 'source-not-regular')}
${destination ? check('omaa_destination', 'destination-not-regular') : ''}
if ! command rm -- "$omaa_source" >/dev/null; then ${emit('unknown', 'unlink-failed', 24)}; fi
if [[ -e "$omaa_source" || -L "$omaa_source" ]]; then ${emit('unknown', 'source-path-present-after-unlink', 25)}; fi
${emit('removed', 'source-unlinked', 0)}`;
  }
  const emit = (state, reason, code) => `[Console]::Out.WriteLine(${pwshQuote(receipt(state, reason))}); exit ${code}`;
  const check = (variable, reason) => `try { $omaaItem = Get-Item -LiteralPath $${variable} -Force -ErrorAction Stop
  if ($omaaItem.PSIsContainer -or ($omaaItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { ${emit('refused', reason, 20)} }
  $omaaDigest = (Get-FileHash -LiteralPath $${variable} -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
} catch { ${emit('refused', 'hash-read-failed', 21)} }
if ($omaaDigest -cne $omaaExpected) { ${emit('refused', reason + '-digest-changed', 22)} }`;
  return `$ErrorActionPreference = 'Stop'
$omaaSource = ${pwshQuote(source)}
$omaaExpected = ${pwshQuote(expected)}
${destination ? `$omaaDestination = ${pwshQuote(destination)}` : ''}
if (-not (Get-Command Get-FileHash -ErrorAction SilentlyContinue)) { ${emit('refused', 'sha256-utility-unavailable', 23)} }
${check('omaaSource', 'source-not-regular')}
${destination ? check('omaaDestination', 'destination-not-regular') : ''}
try { Remove-Item -LiteralPath $omaaSource -ErrorAction Stop } catch { ${emit('unknown', 'unlink-failed', 24)} }
if (Get-Item -LiteralPath $omaaSource -Force -ErrorAction SilentlyContinue) { ${emit('unknown', 'source-path-present-after-unlink', 25)} }
${emit('removed', 'source-unlinked', 0)}`;
}

function shellReceipt(result, operationId, action) {
  if (result.isError) return { state: result.error?.info?.code === 'ABORTED_BEFORE_DISPATCH' ? 'refused' : 'unknown', reason: result.error?.info?.code ?? 'native-tool-error' };
  const value = result.value;
  if (value?.kind === 'promoted' || value?.kind === 'background')
    return { state: 'unknown', reason: 'native-job-has-no-terminal-receipt', ...(typeof value.jobId === 'string' ? { jobId: value.jobId } : {}) };
  if (value?.kind !== 'foreground' || !Number.isInteger(value.exitCode) || value.signal !== null
    || value.timedOut !== false || value.aborted !== false || value.sandbox?.denied || value.sandbox?.runnerFailed
    || value.stdout?.truncated !== false || typeof value.stdout?.text !== 'string' || value.stdout.text.length > 2048)
    return { state: 'unknown', reason: 'native-terminal-receipt-unavailable' };
  let receipt;
  try { receipt = JSON.parse(value.stdout.text.trim()); } catch { return { state: 'unknown', reason: 'helper-receipt-unavailable' }; }
  if (!object(receipt) || Object.keys(receipt).some(key => !['format', 'operationId', 'action', 'state', 'reason'].includes(key))
    || receipt.format !== 'omaa-saved-unlink-v1' || receipt.operationId !== operationId || receipt.action !== action
    || !['removed', 'refused', 'unknown'].includes(receipt.state) || typeof receipt.reason !== 'string'
    || (receipt.state === 'removed' ? value.exitCode !== 0 : value.exitCode === 0))
    return { state: 'unknown', reason: 'helper-receipt-mismatch' };
  return { state: receipt.state, reason: receipt.reason };
}

export function installSavedWorkflowManagementTools(ctx, { storeFor, jsonOutput, writes, permissions }) {
  return ctx.effect(() => {
    const pending = new Map(), locks = new WeakMap();
    let closed = false;
    // A monotonic guard cannot override another tool's approval/policy refusal.
    ctx.tools.guard(exec => {
      const guard = pending.get(exec.callId);
      if (!guard) return;
      try { guard.permission.check(); } catch {
        guard.refusedBeforeDispatch = true;
        return 'Saved workflow standing permissions or parent changed.';
      }
      if (closed || guard.signal.aborted || exec.agent !== guard.agent || exec.parent !== guard.parent
        || exec.name !== guard.shell.name || ctx.tools.get(exec.name, exec.agent) !== guard.shell.definition
        || ctx.omaa.modeFor(exec.agent.session) !== 'default') {
        guard.refusedBeforeDispatch = true;
        return 'Saved workflow unlink scope, mode or native Shell definition changed.';
      }
    });
    const active = (exec, permission) => {
      permission.check();
      exec.signal.throwIfAborted();
      if (closed || ctx.omaa.modeFor(exec.agent.session) !== 'default') throw Error('Change saved workflows only in default working mode.');
    };
    const regular = async (path, exec) => {
      const info = await ctx.fs.lstat(path, { cwd: currentDirectory(ctx, exec.agent.session) }, exec.signal);
      if (info?.type !== 'file') throw Error('Saved definition must be a regular file, without a final symlink.');
    };
    async function execute(action, args, exec) {
      const scope = action === 'move' ? 'global' : args?.scope;
      const keys = action === 'move' ? ['name', 'expected_source_sha256'] : ['name', 'scope', 'expected_source_sha256'];
      if (!object(args) || Object.keys(args).some(key => !keys.includes(key)) || typeof args.name !== 'string'
        || !isValidSavedWorkflowName(args.name) || !['project', 'global'].includes(scope)
        || typeof args.expected_source_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(args.expected_source_sha256))
        throw Error('Provide a saved name, explicit delete scope, and its freshly reviewed full source SHA256.');
      let store = storeFor(exec), permission;
      const source = store.locate(args.name, scope);
      const summary = { action, name: args.name, scope, path: source.path, sourcePath: source.path, expectedSourceSha256: args.expected_source_sha256 };
      let phase = 'preflight', copied = false, copyDispatched = false, shellDispatched = false, shellCallId;
      const output = (status, reason, details = {}) => ({ ok: status === 'completed', ...summary, status, phase, reason,
        ...(copied ? { destinationCreated: true } : {}), ...(shellCallId ? { shellCallId } : {}), ...details,
        response: status === 'completed' ? `Saved workflow ${action === 'move' ? 'moved to project' : 'deleted'}; native receipt and current paths verified.`
          : `Saved workflow ${action} ${status}: ${reason}. Re-read the definition paths before deciding any next action; do not automatically retry or roll back.` });
      let held = locks.get(exec.agent.session);
      if (!held) { held = new Set(); locks.set(exec.agent.session, held); }
      const key = scope + ':' + args.name;
      if (held.has(key)) return output('refused', 'another-management-call-is-active');
      held.add(key);
      try {
        permission = permissions.enter(exec);
        exec = { ...exec, signal: permission.signal };
        store = storeFor(exec);
        active(exec, permission);
        // Check the lexical selected path BEFORE resolve/processPath follows it.
        await regular(source.path, exec);
        const saved = await readSavedWorkflowSnapshot(ctx, exec, await store.load(args.name, scope));
        if (saved.sourceSha256 !== args.expected_source_sha256) return output('refused', 'reviewed-source-digest-changed');
        let destination, destinationTarget;
        const sourcePath = ctx.fs.processPath(saved.target);
        if (action === 'move') {
          destination = store.locate(args.name, 'project'); summary.destinationPath = destination.path;
          if (await ctx.fs.lstat(destination.path, { cwd: currentDirectory(ctx, exec.agent.session) }, exec.signal))
            return output('refused', 'destination-already-exists');
          destinationTarget = await ctx.fs.resolve(destination.path, { cwd: currentDirectory(ctx, exec.agent.session), signal: exec.signal });
          if (destinationTarget.targetKey === saved.target.targetKey) return output('refused', 'source-and-destination-share-target');
          if (await store.read(destination.path, true)) return output('refused', 'destination-already-exists');
        }
        const destinationPath = destinationTarget ? ctx.fs.processPath(destinationTarget) : undefined;
        const shell = chooseShell(ctx, exec, [sourcePath, ...(destinationPath ? [destinationPath] : [])]);
        active(exec, permission);
        if (action === 'move') {
          phase = 'copy'; copyDispatched = true;
          const written = await writes.write({ exec, target: destinationTarget,
            intent: { kind: 'createIfAbsent' }, content: saved.source });
          if (written.result.isError || !written.admitted || written.result.value?.operation !== 'create')
            return output(written.result.error?.info?.code === 'ABORTED_BEFORE_DISPATCH' ? 'refused' : 'unknown', 'native-copy-not-confirmed');
          copied = true;
          if (written.interrupted) return output('partial', 'copy-confirmed-but-permission-or-cancellation-changed');
          await regular(destination.path, exec);
          const check = await readSavedWorkflowSnapshot(ctx, exec, await store.load(args.name, 'project'));
          if (check.sourceSha256 !== saved.sourceSha256) return output('partial', 'copied-destination-digest-changed');
        }
        phase = 'unlink-preflight'; active(exec, permission);
        await regular(source.path, exec);
        if (destination) await regular(destination.path, exec);
        if (ctx.tools.get(shell.name, exec.agent) !== shell.definition) return output(copied ? 'partial' : 'refused', 'native-shell-definition-changed');
        const operationId = randomUUID(), control = new AbortController(), signal = AbortSignal.any([exec.signal, control.signal]);
        shellCallId = randomUUID();
        const guard = { agent: exec.agent, parent: exec.token, signal, control, permission, shell, refusedBeforeDispatch: false };
        pending.set(shellCallId, guard);
        let receipt;
        try {
          phase = 'unlink'; shellDispatched = true;
          const command = unlinkCommand(shell.name, sourcePath, destinationPath, saved.sourceSha256, operationId, action);
          guard.work = ctx.tools.execute({ name: shell.name, arguments: { command,
            description: action === 'move' ? 'Remove verified global workflow after guarded project copy' : 'Delete explicitly selected workflow after source digest verification',
            timeoutMs: 10000, ...(shell.definition.parameters.properties.run_in_background ? { run_in_background: false } : {}) },
            agent: exec.agent, callId: shellCallId, rootCallId: exec.rootCallId, parent: exec.token, signal });
          const result = await guard.work;
          receipt = guard.refusedBeforeDispatch ? { state: 'refused', reason: 'native-shell-guard-refused' } : shellReceipt(result, operationId, action);
          if (receipt.jobId) {
            // Promotion transfers native ownership. Stop this exact nonce-bearing
            // helper, without treating a kill request or job completion as unlink proof.
            try {
              const job = ctx.jobs.get(receipt.jobId, exec.agent.id);
              if (job.owner !== exec.agent.id || job.kind !== shell.name || job.label !== command)
                throw Error('Promoted helper identity changed.');
              const stopped = ctx.jobs.kill(receipt.jobId, exec.agent.id, 'Saved workflow helper has no foreground terminal receipt.');
              receipt.reason = stopped === 'requested' ? 'native-job-stop-requested-outcome-unknown' : 'native-job-already-finished-outcome-unknown';
            } catch { receipt.reason = 'native-job-stop-unconfirmed-outcome-unknown'; }
          } else if (!guard.refusedBeforeDispatch && signal.aborted)
            receipt = { state: 'unknown', reason: 'native-shell-interrupted-outcome-unknown' };
        } finally { pending.delete(shellCallId); }
        if (receipt.state !== 'removed') return output(copied ? 'partial' : receipt.state, receipt.reason,
          { ...(receipt.jobId ? { jobId: receipt.jobId } : {}), ...(receipt.state === 'refused' ? { sourceRemoved: false } : {}) });
        phase = 'verify';
        active(exec, permission);
        if (await ctx.fs.lstat(source.path, { cwd: currentDirectory(ctx, exec.agent.session) }, exec.signal))
          return output(copied ? 'partial' : 'unknown', 'source-path-present-on-readback');
        if (destination) {
          await regular(destination.path, exec);
          const check = await readSavedWorkflowSnapshot(ctx, exec, await store.load(args.name, 'project'));
          if (check.sourceSha256 !== saved.sourceSha256) return output('partial', 'destination-digest-changed-on-readback', { sourceRemoved: true });
        }
        active(exec, permission);
        return output('completed', 'native-unlink-and-path-readback-confirmed', { sourceRemoved: true });
      } catch (error) {
        return output(copied ? 'partial' : (copyDispatched || shellDispatched) ? 'unknown' : 'refused', error?.message ?? 'management-operation-failed');
      } finally { permission?.dispose(); held.delete(key); }
    }
    for (const action of ['move', 'delete']) ctx.tools.register({ name: action + '_saved_workflow',
      description: action === 'move'
        ? 'Move a reviewed global saved workflow to the project with the SAME name and exact source body. Refuse any existing target. Native createIfAbsent copy precedes digest-checked native Shell unlink, within standing permissions with no escalation. This two-step move is not atomic or cross-process CAS. Partial/unknown results require readback; never automatically retry or roll back.'
        : 'Delete the explicitly reviewed project/global saved definition through native Shell within standing permissions, without escalation. Requires full source SHA256 from read_saved_workflow. Only a regular nonsymlink source with matching digest is eligible. Digest-check then unlink is not cross-process CAS. Unknown outcomes require readback; never automatically retry.',
      parameters: { type: 'object', properties: { name: { type: 'string' }, ...(action === 'delete' ? { scope: { type: 'string', enum: ['project', 'global'] } } : {}),
        expected_source_sha256: hashSchema }, required: ['name', ...(action === 'delete' ? ['scope'] : []), 'expected_source_sha256'], additionalProperties: false },
      output: jsonOutput, execute: (args, exec) => execute(action, args, exec) });
    return async () => {
      closed = true;
      const running = [...pending.values()];
      for (const guard of running) guard.control.abort(Error('Saved workflow management scope disposed.'));
      await Promise.allSettled(running.map(guard => guard.work));
    };
  }, 'Saved workflow move and delete registration');
}
