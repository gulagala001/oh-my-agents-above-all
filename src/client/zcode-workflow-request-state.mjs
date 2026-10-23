import { assertSavedWorkflowSession } from './zcode-saved-workflow-state.mjs';
import { assertWorkflowInputIdle } from './zcode-workflow-input-state.mjs';

const MAX_SCRIPT_BYTES = 256 * 1024;
const runPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const submissions = new WeakMap();
export async function submitLiveHoleRequest({ settings, sessions, sidebarRight, sessionId, alive }, { runId, siteId, body }) {
  if (!runPattern.test(runId) || typeof siteId !== 'string' || !siteId
    || typeof body !== 'string' || !body.trim() || new TextEncoder().encode(body).length > MAX_SCRIPT_BYTES)
    throw Error('请选择等待中的留白，并填写最多 256 KiB 的 TypeScript 函数体语句。');
  const check = () => {
    if (!alive()) throw Error('此留白已不在当前运行中，请刷新后重新操作。');
    assertSavedWorkflowSession(settings, sidebarRight, sessionId, true);
  };
  check();
  const args = JSON.stringify({ run_id: runId, site_id: siteId, body });
  const text = `I choose to fill this live workflow hole with these exact TypeScript body statements. Load the zcode-workflows skill, then call fill_workflow with these arguments: ${args}. Keep the current session mode and native permissions. Report the actual tool result; this request does not itself confirm that the hole was filled.`;
  return submitNativeRequest({ settings, sessions, sidebarRight, sessionId, alive }, text, 'omaa-zcode-live-hole');
}

export function submitWorkflowResumeRequest(context, { runId }) {
  if (!runPattern.test(runId)) throw Error('请选择本会话的续跑候选。');
  const text = `I request continuation of this exact archived native workflow under its same run identity. Load the zcode-workflows skill, then call resume_workflow with ${JSON.stringify({ run_id: runId })}. Preserve archived source, arguments, launch-resolved models, directory and native permissions. Run the actual preflight and report any refusal; this request is not proof that replay is safe. Do not substitute amend_workflow, create_workflow or retry uncertain effects.`;
  return submitNativeRequest(context, text, 'omaa-zcode-workflow-resume');
}

export function submitWorkflowQuestionAnswer(context, { questionId, answer }) {
  if (typeof questionId !== 'string' || !/^dwfq-[0-9a-f-]{36}$/.test(questionId)
    || typeof answer !== 'string' || !answer || new TextEncoder().encode(answer).length > MAX_SCRIPT_BYTES)
    throw Error('请选择实际等待中的提问，并填写最多 256 KiB 的回答。');
  const text = `Deliver this exact answer to the Actor's actual pending escalation by calling resolve_workflow_question with ${JSON.stringify({ question_id: questionId, answer })}. Preserve the current native permissions. Report the tool's actual outcome. Do not send_message, conclude a turn, restart a driver or answer a different question.`;
  return submitNativeRequest(context, text, 'omaa-zcode-workflow-question');
}

async function submitNativeRequest({ settings, sessions, sidebarRight, sessionId, alive }, text, source) {
  const check = () => {
    if (!alive()) throw Error('此请求已不属于当前工作流状态，请刷新。');
    assertSavedWorkflowSession(settings, sidebarRight, sessionId, true);
  };
  check();
  const pending = submissions.get(sessions) ?? new Set();
  if (pending.has(sessionId)) throw Error('此会话正在发送工作流请求，请等待请求结果。');
  submissions.set(sessions, pending); pending.add(sessionId);
  try { return await sessions.using(sessionId, { source }, async reference => {
    const { session } = await reference.ready;
    check();
    assertWorkflowInputIdle(session);
    const submission = session.beginSubmission({ mode: 'queue', text, attachments: [] });
    try {
      const result = await session.prompt([{ type: 'text', text }], 'queue', undefined, submission.requestId);
      if (!result.ok || result.value?.accepted !== true) throw Error(result.error?.message || '宿主未接受工作流请求。');
      return result;
    } catch (error) { submission.abandon(); throw error; }
  }); } finally { pending.delete(sessionId); }
}

// The server bounds the decoded source. Also bound its JSON envelope before
// decoding so a stale or malformed response cannot retain an unbounded body.
export async function readWorkflowSourceResponse(response, { sessionId, runId }) {
  const maximum = MAX_SCRIPT_BYTES * 6 + 16 * 1024;
  const length = response.headers?.get?.('content-length');
  if (length !== null && length !== undefined && (!/^\d+$/.test(length) || Number(length) > maximum)) {
    await response.body?.cancel?.().catch(() => {});
    throw Error('工作流源码响应超出读取上限。');
  }
  let raw;
  if (response.body?.getReader) {
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
    const parts = []; let count = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        count += value.byteLength;
        if (count > maximum) throw Error('工作流源码响应超出读取上限。');
        parts.push(decoder.decode(value, { stream: true }));
      }
      parts.push(decoder.decode()); raw = parts.join('');
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
  } else {
    raw = await response.text();
    if (new TextEncoder().encode(raw).length > maximum) throw Error('工作流源码响应超出读取上限。');
  }
  const value = JSON.parse(raw);
  if (!response.ok) throw Error(value.error || `HTTP ${response.status}`);
  if (value.sessionId !== sessionId || value.runId !== runId || !Number.isSafeInteger(value.revision) || value.revision < 1
    || typeof value.script !== 'string' || new TextEncoder().encode(value.script).length > MAX_SCRIPT_BYTES
    || typeof value.scriptHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.scriptHash))
    throw Error('工作流源码与所选运行不一致，或超出读取上限。');
  return value;
}
