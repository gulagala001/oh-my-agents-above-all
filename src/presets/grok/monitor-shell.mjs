import { AsyncLocalStorage } from 'node:async_hooks';

// Decorate the inherited public ShellExecutor inside this Grok group only.
// Native bash/pwsh still own validation, approval, policy, jobs and cancellation.
export const name = 'omaa-grok-monitor-shell';
export const inject = ['omaa', 'tools'];
export function apply(ctx) {
    const inherited = ctx.omaa.shell();
    if (!inherited) throw Error('Grok monitor requires the inherited native ShellExecutor.');
    const scope = ctx;
    const launches = new AsyncLocalStorage(), bodies = new AsyncLocalStorage();
    scope.provide('shell', {
      get sandboxMode() { return inherited.sandboxMode; },
      resolve(request) {
        const body = bodies.getStore();
        if (!body || request.command !== body.command) return inherited.resolve(request);
        // The fixed monitor sets this in the process environment, not by
        // prepending shell syntax (which changes PowerShell param/using rules).
        return inherited.resolve({ ...request, env: { ...request.env, PYTHONUNBUFFERED: '1' } });
      },
      execute: spec => inherited.execute(spec),
    });
    scope.provide('omaaGrokMonitorShell', {
      run(call, next) {
        if (!call.agent || !call.parent || !['bash', 'pwsh'].includes(call.name)
          || typeof call.callId !== 'string' || !call.callId
          || typeof call.arguments?.command !== 'string' || call.arguments.run_in_background !== true)
          throw new Error('Grok monitor requires an owned native background tool call.');
        const expected = Object.freeze({ agent: call.agent, name: call.name, callId: call.callId,
          rootCallId: call.rootCallId, parent: call.parent, command: call.arguments.command });
        return launches.run(expected, next);
      },
    });
    scope.on('tools/execute', (exec, next) => {
      const expected = launches.getStore();
      const exact = expected && exec.agent === expected.agent && exec.name === expected.name
        && exec.callId === expected.callId && exec.rootCallId === expected.rootCallId && exec.parent === expected.parent
        && exec.arguments?.command === expected.command && exec.arguments.run_in_background === true;
      // Clear an inherited body for every unrelated nested tool, even when
      // its command text happens to be identical to the monitor command.
      return bodies.run(exact ? expected : undefined, next);
    });
}
