import React, { useMemo, useState } from 'react';
import { QueueDock, queueCss } from '../../lib/grok-queue.mjs';
import { Tooltip, IconChevronUpOutlineRegular, IconChevronDownOutlineRegular, IconSendOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { decorateSlotComponent } from './themes/shared/slot-decoration.mjs';
import { queueFingerprint, queueOrder } from '../shared/grok-queue.mjs';

const empty = [];
const labels = { 'queue.count': '{n} 条排队消息', 'queue.sending': '发送中…', 'queue.image': '排队消息图片', 'queue.file': '排队文件 {name}',
  'queue.edit': '编辑排队消息', 'queue.edit.unsupported': '此内容不能编辑', 'queue.save': '保存排队消息', 'queue.cancelEdit': '取消编辑',
  'queue.remove': '移除排队消息', 'queue.steer': '插话', 'queue.steer.unavailable': '当前不能插话',
  'queue.editFailed': '编辑失败', 'queue.removeFailed': '移除失败', 'queue.steerFailed': '插话失败' };
const queueLabel = (key, args = {}) => (labels[key] ?? key).replace(/\{(\w+)\}/g, (_match, name) => args[name] ?? '');
const sha256 = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(byte => byte.toString(16).padStart(2, '0')).join('');

export function applyGrokQueue(ctx) {
  function GrokQueue(props) {
    const [error, setError] = useState('');
    const inbox = props.useProjection('inbox'), running = props.useSession(value => value.running);
    const pending = props.useSessionStatus(value => value.get(props.sessionId)?.pendingInteraction);
    const nextTurn = inbox?.['next-turn'] ?? empty, nextStep = inbox?.['next-step'] ?? empty;
    const merged = useMemo(() => ({ ...inbox, 'next-turn': [
      ...nextStep.map(row => ({ ...row, target: 'next-step' })),
      ...nextTurn.map(row => ({ ...row, target: 'next-turn' })),
    ] }), [inbox, nextTurn, nextStep]);
    const updateQueue = async (itemId, action, expected) => {
      setError('');
      if (!expected) throw Error('消息已开始发送，请查看当前队列。');
      const target = expected.target;
      const body = { itemId, kind: action.kind, target, expected: await sha256(queueFingerprint(expected, target)),
        ...(action.kind === 'edit' ? { text: action.content.map(block => block.text).join('') } : {}),
        ...(['up', 'down'].includes(action.kind) ? { order: queueOrder(target === 'next-turn' ? nextTurn : nextStep) } : {}) };
      const response = await fetch('/omaa-grok/api/queue?session=' + encodeURIComponent(props.sessionId), {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok || !result.accepted) throw Error(result.error || '队列操作未被接纳。');
    };
    const renderActions = (row, busy, apply) => {
      const rows = row.target === 'next-turn' ? nextTurn : nextStep, at = rows.findIndex(item => item.id === row.id);
      const button = (kind, label, Icon, disabled = false) => <Tooltip key={kind} portal label={label} side="bottom" delayMs={500}>
        <button type="button" className="omaaGrokQueue_action" aria-label={label} disabled={busy !== null || disabled}
          onClick={() => void apply(row.id, { kind }, '队列操作失败')}><Icon size={14}/></button>
      </Tooltip>;
      return <React.Fragment key="grok-actions">
        {row.target === 'next-step' && <span className="omaaGrokQueue_status">等待插话</span>}
        {button('up', '上移消息', IconChevronUpOutlineRegular, rows[at - 1]?.source.kind !== 'user')}
        {button('down', '下移消息', IconChevronDownOutlineRegular, rows[at + 1]?.source.kind !== 'user')}
        {button('send-now', '立即发送（停止当前回合）', IconSendOutlineRegular)}
      </React.Fragment>;
    };
    const hasQueue = nextTurn.length + nextStep.length > 0;
    return <div className="omaa-grok-queue" data-grok-queue="">
      {error && <p role="alert" className="omaa-grok-queue-status">{error}</p>}
      {hasQueue && <p role="status" className="omaa-grok-queue-status">{pending
        ? '等待你的回复或权限决定；排队消息会保留。立即发送会取消当前回合。'
        : running ? '任务执行中；插话在当前工具结束后送达，立即发送会停止当前回合。'
          : '待发送消息已保存。选择立即发送可继续。'}</p>}
      <QueueDock {...props} t={queueLabel} notify={(_level, text) => setError(text)}
        loadImage={attachment => ctx.uiConversation.imageUrl(props.sessionId, attachment)}
        useProjection={() => merged} updateQueue={updateQueue} renderActions={renderActions}
        canSteer={row => row.target === 'next-turn' && !pending}/>
    </div>;
  }
  ctx.effect(() => {
    const style = document.createElement('style'); style.dataset.omaaGrokQueue = '';
    style.textContent = queueCss + '\n.omaa-grok-queue{display:contents}.omaa-grok-queue-status{font-size:12px;color:var(--dsw-alias-label-tertiary);margin:4px auto;max-width:var(--dsh-composer-card-max-width);padding:0 16px}.omaaGrokQueue_actions{gap:2px}.omaaGrokQueue_list{max-height:260px}@media(max-width:600px){.omaaGrokQueue_row{flex-wrap:wrap}.omaaGrokQueue_actions{margin-left:auto}.omaaGrokQueue_preview{flex-basis:50%}}';
    document.head.append(style); return () => style.remove();
  });
  ctx.slots.inject('conversation.input.dock', () => decorateSlotComponent(ctx.slots, 'conversation.input.dock',
    (_key, entry) => entry.options.id === 'queue', entry => {
      const Original = entry.component;
      return function GrokQueueEntry(props) {
        const preset = props.useProjection('agentPreset'), subagent = props.useSession(value => value.subagent);
        const pending = props.useSessionStatus(value => value.get(props.sessionId)?.pendingInteraction);
        return preset === 'omaa-grok' && subagent === null ? pending ? null : <GrokQueue {...props}/> : <Original {...props}/>;
      };
    }));
  // Native questions/approval temporarily cover the resident composer. Keep
  // their actual component and controls, adding the same queue above it so
  // an explicit send-now remains reachable while awaiting a user decision.
  ctx.slots.inject('conversation.composer', () => decorateSlotComponent(ctx.slots, 'conversation.composer', () => true, entry => {
    const Original = entry.component;
    return function GrokWaitingQueue(props) {
      const preset = props.useProjection('agentPreset'), subagent = props.useSession(value => value.subagent);
      const pending = props.useSessionStatus(value => value.get(props.sessionId)?.pendingInteraction);
      return <>{preset === 'omaa-grok' && subagent === null && pending && <GrokQueue {...props}
        renderFactorySlot={(name, input) => name === 'conversation.user.text' ? <span>{input.text}</span> : null}/>}
        <Original {...props}/></>;
    };
  }));
}
