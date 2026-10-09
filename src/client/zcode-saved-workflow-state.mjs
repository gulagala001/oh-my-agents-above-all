import { SavedWorkflowMetaSchema, SavedWorkflowEntrySchema, SavedWorkflowInvalidEntrySchema, isValidSavedWorkflowName } from '../../lib/zcode-saved-contract.mjs';
import { validateWorkflowArgs } from '../../lib/zcode-saved-args.mjs';

const record = value => value && typeof value === 'object' && !Array.isArray(value);
export function savedWorkflowResult(block) {
  for (const part of Array.isArray(block?.content) ? block.content : []) {
    if (part?.type !== 'text' || typeof part.text !== 'string') continue;
    try { const value = JSON.parse(part.text); if (record(value)) return value; } catch {}
  }
}

const nonempty = value => typeof value === 'string' && value.length > 0;
const optionalText = value => value === undefined || typeof value === 'string';
const identityFields = value => record(value) && typeof value.name === 'string' && isValidSavedWorkflowName(value.name) &&
  ['project', 'global'].includes(value.scope) && nonempty(value.path) && optionalText(value.description) && optionalText(value.whenToUse) &&
  (value.facade === undefined || ['native', 'zcode'].includes(value.facade)) &&
  (value.shadowing === undefined || ['hides_global', 'hidden_by_project'].includes(value.shadowing));
const diagnostics = value => Array.isArray(value) && value.every(row => record(row) && typeof row.message === 'string');
const fieldsOf = (value, fields) => record(value) && Object.keys(value).every(key => fields.includes(key));

export function savedWorkflowRunKind(value) {
  if (!record(value) || !optionalText(value.status) || !optionalText(value.response) ||
      (value.runId !== undefined && !nonempty(value.runId)) || (value.jobId !== undefined && !nonempty(value.jobId)) ||
      (value.ok !== undefined && typeof value.ok !== 'boolean') ||
      (value.error !== undefined && (!record(value.error) || !nonempty(value.error.kind) || typeof value.error.message !== 'string')) ||
      (value.diagnostics !== undefined && !diagnostics(value.diagnostics))) return;
  if (value.kind === 'foreground' && nonempty(value.runId) && Number.isSafeInteger(value.agentsStarted) && value.agentsStarted >= 0 && Object.hasOwn(value, 'result')) return 'native';
  if (value.kind === 'background' && nonempty(value.runId) && nonempty(value.jobId)) return 'native';
  if (value.kind !== undefined || typeof value.ok !== 'boolean') return;
  if (value.ok && value.status === 'backgrounded' && nonempty(value.runId) && nonempty(value.jobId)) return 'typed-run';
  if (nonempty(value.runId) && Array.isArray(value.reports) && Array.isArray(value.actors)) return 'typed-run';
  if (!value.ok && diagnostics(value.diagnostics) && typeof value.response === 'string' && value.runId === undefined) return 'typed-diagnostics';
}

export function supportedSavedWorkflowResult(toolName, value) {
  let supported = false;
  if (toolName === 'list_saved_workflows') supported = fieldsOf(value, ['workflows', 'invalid']) && Array.isArray(value.workflows) &&
    value.workflows.every(row => SavedWorkflowEntrySchema.safeParse(row).success && isValidSavedWorkflowName(row.name)) &&
    (value.invalid === undefined || Array.isArray(value.invalid) && value.invalid.every(row => SavedWorkflowInvalidEntrySchema.safeParse(row).success));
  else if (toolName === 'read_saved_workflow') supported = fieldsOf(value, ['name', 'scope', 'path', 'description', 'whenToUse', 'args', 'facade', 'script', 'source', 'bodyLineOffset']) && Boolean(savedWorkflowDefinition(value));
  else if (toolName === 'save_workflow') supported = fieldsOf(value, ['ok', 'name', 'scope', 'path', 'diagnostics', 'response', 'overwritten', 'shadowing']) && identityFields(value) && typeof value.ok === 'boolean' && diagnostics(value.diagnostics) && typeof value.response === 'string' &&
    (value.overwritten === undefined || typeof value.overwritten === 'boolean') && (!value.ok || typeof value.overwritten === 'boolean');
  else if (toolName === 'run_saved_workflow') supported = fieldsOf(value, ['name', 'scope', 'path', 'result', 'facade']) && identityFields(value) && Boolean(savedWorkflowRunKind(value.result));
  if (!supported) return false;
  // A compatible shape still has to be displayable without mutating numbers
  // or overflowing the formatter. Incompatible material stays native text.
  const pending = [value];
  while (pending.length) {
    const next = pending.pop();
    if (typeof next === 'number' && !Number.isFinite(next)) return false;
    if (next && typeof next === 'object') for (const child of Object.values(next)) pending.push(child);
  }
  try { JSON.stringify(value); return true; } catch { return false; }
}

export function savedWorkflowDefinition(value) {
  if (!identityFields(value) ||
      !['native', 'zcode'].includes(value.facade) || typeof value.script !== 'string' || typeof value.source !== 'string') return;
  if (value.bodyLineOffset !== undefined && (!Number.isSafeInteger(value.bodyLineOffset) || value.bodyLineOffset < 0)) return;
  const parsed = SavedWorkflowMetaSchema.safeParse({ description: value.description,
    ...(value.whenToUse === undefined ? {} : { whenToUse: value.whenToUse }),
    ...(value.args === undefined ? {} : { args: value.args }) });
  if (!parsed.success) return;
  return { ...value, ...parsed.data };
}

export function savedWorkflowDraft(definition) {
  return Object.fromEntries(Object.entries(definition.args || {}).map(([name, spec]) => [name, {
    include: spec.required === true && spec.default === undefined,
    text: spec.type === 'boolean' ? 'false' : '',
  }]));
}

function jsonNumberIssue(value) {
  const pending = [value];
  while (pending.length) {
    const next = pending.pop();
    if (typeof next === 'number') {
      if (!Number.isFinite(next)) return 'non-finite';
      if (Number.isInteger(next) && !Number.isSafeInteger(next)) return 'unsafe-integer';
    }
    if (next && typeof next === 'object') for (const child of Object.values(next)) pending.push(child);
  }
}

export function savedWorkflowArgs(definition, draft) {
  const given = Object.create(null), errors = [], jsonFields = [];
  for (const [name, field] of Object.entries(draft)) {
    if (!field.include) continue;
    const spec = Object.hasOwn(definition.args || {}, name) ? definition.args[name] : undefined;
    if (!spec) { errors.push(`unknown argument '${name}'`); continue; }
    if (spec.type === 'string') { given[name] = field.text; jsonFields.push(`${JSON.stringify(name)}:${JSON.stringify(field.text)}`); continue; }
    try {
      const value = JSON.parse(field.text);
      const issue = jsonNumberIssue(value);
      if (issue === 'unsafe-integer') { errors.push(`${name}：整数超出可精确处理的范围，请改用字符串参数或调整定义。`); continue; }
      if (issue) throw Error();
      if (spec.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) throw Error();
      if (spec.type === 'boolean' && typeof value !== 'boolean') throw Error();
      given[name] = value;
      jsonFields.push(`${JSON.stringify(name)}:${spec.type === 'boolean' ? JSON.stringify(value) : field.text}`);
    } catch { errors.push(`${name}：请输入${spec.type === 'number' ? '有限数字' : spec.type === 'boolean' ? 'true 或 false' : '有效 JSON（数字必须为有限值）'}。`); }
  }
  const checked = validateWorkflowArgs(definition.args, given);
  if (!checked.ok) errors.push(...checked.errors);
  // Keep omitted values omitted: the backend rereads the current definition
  // and applies its current defaults, rather than freezing this old result.
  return errors.length ? { ok: false, errors } : { ok: true, args: Object.fromEntries(Object.entries(given)), argsJson: `{${jsonFields.join(',')}}` };
}

function sameJSONValues(left, right) {
  const pairs = [[left, right]];
  while (pairs.length) {
    const [a, b] = pairs.pop();
    if (Object.is(a, b)) continue;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a) && a.length !== b.length) return false;
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    for (const key of keys) { if (!Object.hasOwn(b, key)) return false; pairs.push([a[key], b[key]]); }
  }
  return true;
}

export function assertSavedWorkflowSession(settings, sidebarRight, sessionId, run = false, idle = true) {
  const current = settings.getSnapshot();
  if (!sessionId || current.sessionId !== sessionId || current.data?.product?.id !== 'zcode' ||
      (current.agentPreset && current.agentPreset !== 'omaa-zcode') || sidebarRight.mounted.getSnapshot() !== sessionId) throw Error('会话已切换，请在当前 ZCode 会话重新操作。');
  if (current.loading || current.saving || current.error || current.data.pendingMode) throw Error('请等待会话设置和模式切换完成后再操作。');
  if (idle && current.data.running) throw Error('请等待当前任务结束后再发送请求。');
  if (run && current.data.mode !== 'default') throw Error('请先切换到执行模式，再运行工作流。');
}

export async function submitSavedWorkflowRequest({ settings, sessions, sidebarRight, sessionId, alive }, action, value) {
  const run = action === 'run';
  if (!['read', 'run'].includes(action) || typeof value?.name !== 'string' || !isValidSavedWorkflowName(value.name) || !['project', 'global'].includes(value.scope)) throw Error('请选择有效的保存定义。');
  const check = () => { if (!alive()) throw Error('此工作流卡片已关闭，请重新操作。'); assertSavedWorkflowSession(settings, sidebarRight, sessionId, run); };
  check();
  let argsText = JSON.stringify({ name: value.name, scope: value.scope });
  if (run) {
    let parsed;
    try { parsed = typeof value.argsJson === 'string' ? JSON.parse(value.argsJson) : undefined; } catch {}
    if (!record(parsed) || jsonNumberIssue(parsed) || !sameJSONValues(parsed, value.args)) throw Error('参数材料与已校验的值不一致，请重新填写。');
    argsText = `{"name":${JSON.stringify(value.name)},"scope":${JSON.stringify(value.scope)},"args":${value.argsJson}}`;
  }
  const text = run
    ? `I choose to run this saved workflow. Load the zcode-workflows skill, then use run_saved_workflow with these arguments: ${argsText}. Read the current saved definition when running it; the current session mode and permissions apply.`
    : `Read this saved workflow with read_saved_workflow, without running it: ${argsText}.`;
  return sessions.using(sessionId, { source: 'omaa-zcode-saved-workflow' }, async reference => {
    const { session } = await reference.ready;
    check();
    if (session.getSnapshot().running) throw Error('当前会话已经开始运行，请等待结束后再发送请求。');
    const submission = session.beginSubmission({ mode: 'queue', text, attachments: [] });
    try {
      const result = await session.prompt([{ type: 'text', text }], 'queue', undefined, submission.requestId);
      if (!result.ok || result.value?.accepted !== true) throw Error(result.error?.message || '宿主未接受工作流请求。');
      return result;
    } catch (error) { submission.abandon(); throw error; }
  });
}
