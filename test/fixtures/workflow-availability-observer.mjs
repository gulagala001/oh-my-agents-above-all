// Read only observations of the real installed host. No engines/tools are registered.
export const inject = ['agents', 'tools', 'webServer', 'connection', 'loader'];
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/workflow-availability-observer', async handler(req, res) {
    const rejection = ctx.connection.requestRejection(req);
    if (rejection !== undefined) { res.writeHead(rejection); res.end(); return; }
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    try {
      const id = new URL(req.url, 'http://localhost').searchParams.get('session');
      const agent = ctx.agents.get(id);
      // Observe disappearance too; this probe must not create a new required
      // OMAA dependency that can itself become a pending profile entry.
      const controller = ctx.get('omaa')?.workflowFor(agent);
      const workflows = agent ? ctx.tools.schemas(agent).filter(row => row.name === 'workflow') : [];
      const value = { agent: Boolean(agent), controller: Boolean(controller), mode: controller?.mode,
        workflows: workflows.map(row => ({ name: row.name, resumable: Boolean(row.parameters?.properties?.resumeFromRunId) })),
        omdRows: [...ctx.loader.entries()].filter(row => row.options.name === 'trisoul_x').map(row => ({ id: row.options.id, state: row.fiber?.state })) };
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value));
    } catch (error) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
  } }));
}
