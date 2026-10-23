import { readFile, writeFile, mkdir, rename, rm, realpath } from 'node:fs/promises';
import { join, relative, isAbsolute, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { reviewLineAnchor } from '../../host/cursor-editor.mjs';
import { cursorReviewOptions, cursorCommentNote, cursorCommentTarget, cursorLineText, cursorFeedbackText, cursorCommentLimits } from '../../shared/cursor-review.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const fresh = () => ({ version: 1, revision: 0, comments: [], reviewed: [], delivery: null });
const conflict = () => Object.assign(Error('批注已在另一窗口更新，请刷新后继续；没有覆盖已有内容。'), { code: 'revision-conflict' });
const matchesRequest = (source, id) => source?.kind === 'user' && source.rpcId === id;
const admitted = (agent, session, id) => [...agent.inbox.nextStep, ...agent.inbox.nextTurn].some(message => matchesRequest(message.source, id)) ||
  session.snapshotEvents().some(event => event.type === 'user/message' && matchesRequest(event.data.source, id));

export function createCursorReview({ directory, hub, gitReview, controller, flush, editor, currentDirectory = session => session.header.cwd }) {
  const locks = new Map();
  async function serial(id, operation) {
    const previous = locks.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(operation); locks.set(id, next);
    try { return await next; } finally { if (locks.get(id) === next) locks.delete(id); }
  }
  const fileFor = id => join(directory, hash(id) + '.json');
  async function load(id) {
    try {
      const state = JSON.parse(await readFile(fileFor(id), 'utf8'));
      if (state.version !== 1 || !Number.isSafeInteger(state.revision) || !Array.isArray(state.comments) || !Array.isArray(state.reviewed)) throw Error('本地审阅记录格式无效，原文件已保留。');
      return state;
    } catch (error) { if (error.code === 'ENOENT') return fresh(); throw error; }
  }
  async function save(id, state) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = fileFor(id), temp = file + '.' + randomUUID() + '.tmp';
    const updated = { ...state, revision: state.revision + 1 };
    try { await writeFile(temp, JSON.stringify(updated), { flag: 'wx', mode: 0o600 }); await rename(temp, file); }
    finally { await rm(temp, { force: true }); }
    return updated;
  }
  async function owner(id) {
    const value = await hub.inspect(id);
    if (hub.product(value.session)?.id !== 'cursor' || !value.agent) throw Error('代码审阅仅用于已启用的 Cursor 会话。');
    return value;
  }
  function idle({ agent, value }, mode) {
    if (agent.status !== 'idle' || agent.inbox.nextTurn.length || agent.inbox.nextStep.length || value.pendingMode || value.mode !== mode)
      throw Error(mode === 'ask' ? '请先停止任务并进入只读问答模式，再开始问题检查。' : '请先停止任务、清空待发送队列并进入执行模式，再继续修改。');
  }
  async function reconcile(id, state, owned) {
    if (!state.delivery || !admitted(owned.agent, owned.session, state.delivery.requestId)) return state;
    const delivery = state.delivery, time = new Date().toISOString();
    await flush(owned.session);
    return save(id, { ...state, delivery: null, lastDelivery: { requestId: delivery.requestId, kind: delivery.kind, acceptedAt: time },
      comments: state.comments.map(comment => delivery.items?.some(item => item.id === comment.id && item.version === comment.version)
        ? { ...comment, status: 'submitted', requestId: delivery.requestId, submittedAt: time } : comment) });
  }
  async function view(owned, input) {
    const options = cursorReviewOptions(input), { session } = owned;
    if (options.scope !== 'turn') return gitReview.inspect(session, options);
    if (!hub.checkpoints) throw Error('文件检查点服务尚未就绪。');
    const { checkpoint } = await hub.checkpoints.inspect(session.id, session, { seq: options.seq });
    if (!checkpoint.reviewAvailable) throw Error('该回合的原生比较已不可用；已保存批注仍可查看。');
    const root = session.header.cwd;
    const files = checkpoint.summary.files.map((file, index) => {
      const name = relative(root, isAbsolute(file.path) ? file.path : resolve(root, file.path)).split(sep).join('/');
      if (!name || name === '..' || name.startsWith('../') || isAbsolute(name)) throw Error('回合比较包含工作目录之外的文件。');
      return { ...file, path: name, nativeIndex: index, actions: [] };
    });
    const revision = hash(JSON.stringify({ root, seq: options.seq, summary: checkpoint.summary }));
    if (options.revision && options.revision !== revision) throw conflict();
    const result = { sessionId: session.id, root, scope: 'turn', seq: options.seq, turn: checkpoint.turn, revision,
      files, total: files.length, added: checkpoint.summary.added, deleted: checkpoint.summary.deleted };
    if (!options.path) return result;
    const file = files.find(file => file.path === options.path);
    if (!file) throw Error('文件不在选定回合中。');
    const { diff } = await hub.checkpoints.inspect(session.id, session, { seq: options.seq, index: file.nativeIndex });
    return { ...result, diff: { ...diff, path: file.path }, hunkActions: {} };
  }
  async function verifiedTarget(owned, input) {
    const target = cursorCommentTarget(input);
    const summary = await view(owned, { ...target, path: undefined });
    if (summary.root !== target.root || summary.revision !== target.revision) throw conflict();
    const detail = await view(owned, target), context = cursorLineText(detail.diff, target.side, target.line);
    if (context === undefined) throw Error('该行不在所记录的比较中，请重新选择。');
    return { target, context: context.slice(0, 2000), anchor: reviewLineAnchor(detail.diff, target.side, target.line) };
  }
  return {
    async inspect(id, input = {}) {
      const owned = await owner(id);
      if (input.kind === 'notes') return serial(id, async () => reconcile(id, await load(id), owned));
      if (input.kind === 'editors') return { editors: await editor.list() };
      if (input.kind === 'references') return gitReview.references(owned.session);
      if (input.kind === 'turns') {
        const result = await hub.checkpoints.inspect(id, owned.session);
        return { turns: result.checkpoints.filter(item => item.reviewAvailable).map(({ seq, turn, summary }) => ({ seq, turn, files: summary.files.length })) };
      }
      return view(owned, input);
    },
    async openEditor(id, request, signal) {
      const owned = await owner(id);
      let root, path, anchor, line;
      if (request.commentId) {
        const note = (await load(id)).comments.find(item => item.id === request.commentId);
        if (!note) throw Error('批注已不存在，请刷新记录。');
        ({ root, path, line } = note.target);
        anchor = note.anchor ?? (await verifiedTarget(owned, note.target)).anchor;
      } else if (request.target) {
        const verified = await verifiedTarget(owned, request.target);
        ({ root, path, line } = verified.target); anchor = verified.anchor;
      } else {
        const summary = await view(owned, { ...request.view, path: undefined });
        if (summary.revision !== request.view?.revision || !summary.files.some(item => item.path === request.path)) throw conflict();
        root = summary.root; path = request.path;
      }
      if (await realpath(root) !== await realpath(currentDirectory(owned.session))) throw Error('会话工作目录已改变，请在对应目录重新打开审阅。');
      await owner(id); signal.throwIfAborted();
      return editor.open({ root, path, anchor, line, editor: request.editor }, signal);
    },
    async update(id, request) {
      return serial(id, async () => {
        let owned = await owner(id), state = await reconcile(id, await load(id), owned);
        if (request?.revision !== state.revision) throw conflict();
        if (state.delivery && request.action !== 'submit' && request.action !== 'find-issues') throw Error('上一批反馈的接纳状态尚未确认，请先重试提交或刷新。');
        const time = new Date().toISOString();
        if (request.action === 'save-comment') {
          const note = cursorCommentNote(request.note), existing = request.id && state.comments.find(item => item.id === request.id);
          if (request.id && !existing) throw conflict();
          if (existing && existing.status !== 'draft') throw Error('已发送的批注保留为历史；请添加新的修改意见。');
          if (!existing && state.comments.length >= cursorCommentLimits.history) throw Error('已保存 200 条批注，请删除不再需要的已解决记录。');
          const anchor = existing ? { target: existing.target, context: existing.context, ...(existing.anchor ? { anchor: existing.anchor } : {}) } : await verifiedTarget(owned, request.target);
          const comment = { ...existing, ...anchor, id: existing?.id ?? randomUUID(), version: (existing?.version ?? 0) + 1, note,
            status: 'draft', createdAt: existing?.createdAt ?? time, updatedAt: time };
          const comments = existing ? state.comments.map(item => item.id === existing.id ? comment : item) : [...state.comments, comment];
          cursorFeedbackText(comments.filter(item => item.status === 'draft'));
          return save(id, { ...state, comments });
        }
        if (request.action === 'delete-comment' || request.action === 'resolve-comment' || request.action === 'reopen-comment') {
          const existing = state.comments.find(item => item.id === request.id);
          if (!existing) throw conflict();
          const comments = request.action === 'delete-comment' ? state.comments.filter(item => item.id !== existing.id)
            : state.comments.map(item => item.id !== existing.id ? item : { ...item, status: request.action === 'resolve-comment' ? 'resolved' : 'draft', version: item.version + 1, updatedAt: time });
          if (comments.some(item => item.status === 'draft')) cursorFeedbackText(comments.filter(item => item.status === 'draft'));
          return save(id, { ...state, comments });
        }
        if (request.action === 'mark-reviewed') {
          const summary = await view(owned, { ...request.view, path: undefined });
          if (summary.revision !== request.view.revision || !summary.files.some(file => file.path === request.path)) throw conflict();
          const rest = state.reviewed.filter(item => !(item.root === summary.root && item.scope === summary.scope && item.path === request.path));
          const reviewed = request.reviewed === false ? rest : [...rest, { root: summary.root, scope: summary.scope, revision: summary.revision, path: request.path }].slice(-500);
          return save(id, { ...state, reviewed });
        }
        if (request.action !== 'submit' && request.action !== 'find-issues') throw Error('未知的审阅操作。');
        const kind = request.action === 'submit' ? 'feedback' : 'issues';
        if (state.delivery && state.delivery.kind !== kind) throw Error('请先确认上一批反馈的提交状态。');
        idle(owned, kind === 'feedback' ? 'default' : 'ask');
        if (!state.delivery) {
          const items = state.comments.filter(item => item.status === 'draft');
          let text;
          if (kind === 'feedback') text = cursorFeedbackText(items);
          else {
            const summary = await view(owned, { ...request.view, path: undefined });
            if (summary.revision !== request.view.revision) throw conflict();
            const files = request.path ? summary.files.filter(file => file.path === request.path) : summary.files;
            if (!files.length || files.length > 64 || !request.path && summary.total !== files.length) throw Error('请选择 1 至 64 个实际变更文件；较大范围请逐文件检查。');
            const comparison = { scope: summary.scope, root: summary.root, revision: summary.revision, ref: summary.ref, commit: summary.commit, base: summary.base, seq: summary.seq, turn: summary.turn };
            text = `Find concrete correctness issues introduced by this comparison: ${JSON.stringify(comparison)}.\nFiles: ${JSON.stringify(files.map(file => file.path))}\n\nPerform a read-only review. Inspect the actual diff, current files and relevant surrounding code; for a recorded turn consult the native conversation and tool evidence. Branch scope compares the merge base to the selected HEAD, not uncommitted work. Files may have changed since the comparison. Do not edit files. Report only supported actionable findings with file/line references, or say no supported issues were found. State any material limitation.`;
          }
          state = await save(id, { ...state, delivery: { requestId: randomUUID(), kind, text, items: kind === 'feedback' ? items.map(({ id, version }) => ({ id, version })) : [], preparedAt: time } });
        }
        // Persist the native admission identity before crossing the host boundary.
        // A lost HTTP acknowledgement is reconciled from the real inbox/journal;
        // refresh never starts work, and an explicit retry reuses the same id.
        owned = await owner(id); idle(owned, kind === 'feedback' ? 'default' : 'ask');
        const result = await controller().prompt({ sessionId: id, requestId: state.delivery.requestId, mode: 'queue', content: [{ type: 'text', text: state.delivery.text }] }, new AbortController().signal);
        if (result?.accepted !== true) throw Error('宿主未接受本次审阅请求，批注已保留。');
        return reconcile(id, state, owned);
      });
    },
  };
}
