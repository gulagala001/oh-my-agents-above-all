import { createHash } from 'node:crypto';
import { queueFingerprint, queueOrder } from '../shared/grok-queue.mjs';
import { readJson, sendJson } from './http.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const fail = (message, statusCode = 409) => { throw Object.assign(Error(message), { statusCode }); };
const lane = (agent, target) => target === 'next-turn' ? agent.inbox.nextTurn : agent.inbox.nextStep;

export function createPresetQueue(ctx, hub, product) {
  let closed = false;
  ctx.effect(() => () => { closed = true; });
  async function owner(sessionId) {
    const { agent, session } = await hub.inspect(sessionId);
    const check = () => {
      if (closed || !agent || ctx.agents.get(sessionId) !== agent || ctx.sessions.get(sessionId) !== session
        || hub.product(session)?.id !== product || session.header.origin === 'subagent'
        || Number(session.header.delegationDepth ?? 0) > 0) fail('队列操作仅用于当前已启用的 ' + product + ' 主会话。', 403);
    };
    check(); return { agent, session, check };
  }
  const describe = agent => ({ running: agent.status === 'running',
    lanes: Object.fromEntries(['next-turn', 'next-step'].map(target => [target, lane(agent, target).map(row => ({
      ...row, target, revision: digest(queueFingerprint(row, target)), editable: row.source.kind === 'user',
    }))])) });
  return {
    async inspect(sessionId) { return describe((await owner(sessionId)).agent); },
    async update(sessionId, input) {
      if (!input || !['edit', 'remove', 'steer', 'up', 'down', 'send-now'].includes(input.kind)
        || typeof input.itemId !== 'string' || !/^[a-f0-9]{64}$/.test(input.expected ?? '')
        || !['next-turn', 'next-step'].includes(input.target)) fail('无效的队列操作。', 400);
      const { agent, session, check } = await owner(sessionId);
      const rows = lane(agent, input.target), index = rows.findIndex(row => row.id === input.itemId), row = rows[index];
      if (!row || digest(queueFingerprint(row, input.target)) !== input.expected) fail('消息已修改或开始发送；请保留草稿并重新查看当前队列。');
      if (row.source.kind !== 'user') fail('运行通知与权限回复不可作为用户队列编辑。', 403);
      if (input.kind === 'edit') {
        if (typeof input.text !== 'string' || !input.text.trim() || Buffer.byteLength(input.text) > 48 * 1024) fail('消息需要非空文本，最多 48 KiB。', 400);
        if (!row.content.every(block => ['text', 'image', 'file'].includes(block.type))) fail('此消息包含不可编辑的内容。', 400);
        // Keep original durable attachment identities; the browser cannot
        // replace them with another session's refs while editing text.
        agent.inbox.replace(row.id, { ...row, content: [{ type: 'text', text: input.text }, ...row.content.filter(block => block.type !== 'text')] });
      } else if (input.kind === 'remove') {
        agent.inbox.remove(row.id);
        if ('rpcId' in row.source) ctx.get('fileUploads')?.retirePrompt(agent, row.source.rpcId);
      } else if (input.kind === 'up' || input.kind === 'down') {
        if (input.order !== queueOrder(rows)) fail('队列顺序已经改变，请按当前顺序重新操作。');
        const other = index + (input.kind === 'up' ? -1 : 1);
        if (!rows[other] || rows[other].source.kind !== 'user') fail('已到达可排序消息的边界。');
        const start = Math.min(index, other);
        // One native event, only two user-owned rows. Never discard an
        // interleaved scheduler notice or queued answer as a side effect.
        agent.inbox.splice(input.target, start, 2, [rows[start + 1], rows[start]]);
      } else if (input.kind === 'steer') {
        if (input.target !== 'next-turn' || agent.status !== 'running') fail('当前回合已不能接收插话。');
        agent.inbox.remove(row.id); agent.steer(row);
      } else {
        const sendNow = () => {
          check();
          // All mutations are synchronous. Cancel retains the remaining
          // inbox and background jobs; followup latches the next native turn.
          agent.cancel({ kind: 'user' }, { keepInbox: true });
          agent.inbox.remove(row.id);
          agent.followup(row);
          if (agent.inbox.nextTurn[0]?.id !== row.id) {
            agent.inbox.remove(row.id); agent.inbox.prepend('next-turn', row);
          }
        };
        if (agent.status === 'idle') await agent.runMaintenance(sendNow);
        else sendNow();
      }
      await ctx.sessions.flush(session);
      return { accepted: true, ...describe(agent) };
    },
  };
}

export function installPresetQueue(ctx, hub, product) {
  if (!['grok', 'cursor'].includes(product)) throw Error('Unsupported preset queue');
  const endpoint = '/omaa-' + product + '/api/queue';
  const queue = createPresetQueue(ctx, hub, product);
  ctx.inject(['webServer', 'connection'], web => {
    web.effect(() => web.webServer.register({ kind: 'prefix', path: endpoint, async handler(req, res) {
      const rejected = web.connection.requestRejection(req);
      if (rejected !== undefined) { res.writeHead(rejected); res.end(); return; }
      try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname !== endpoint) { sendJson(res, 404, { error: '接口不存在' }); return; }
        const id = url.searchParams.get('session');
        if (!id) fail('请选择会话。', 400);
        if (req.method === 'GET') sendJson(res, 200, await queue.inspect(id));
        else if (req.method === 'POST') sendJson(res, 200, await queue.update(id, await readJson(req)));
        else sendJson(res, 405, { error: '不支持此方法' });
      } catch (error) { sendJson(res, error.statusCode ?? 400, { error: error.message }); }
    } }));
  });
}
