// One accepted ask can finish before its delivery RPC returns. Retain each
// native turn's facts and bind the accepted message to its own consumed turn.
// A later unrelated turn must not replace its terminal reason or result text.
import { NUDGE_PROMPT } from '../../../lib/zcode-ask-protocol.mjs';

export function verifyAskExchange(events, accepted, boundary, finalKind = 'completed') {
  const hops = [{ messageId: accepted.messageId }, ...(accepted.continuations ?? [])];
  const admissions = new Map(); let turn;
  const inboxIds = new Set();
  for (const event of events) {
    if (event.type === 'agent/inbox/spliced') for (const message of event.data.inserted ?? []) inboxIds.add(message.id);
    if (event.type === 'turn/start') turn = event.data.turn;
    else if (event.type === 'turn/end') turn = undefined;
    else if (event.type === 'user/message' && event.surfaceOp === 'append') {
      const message = event.data.message ?? event.data, list = admissions.get(message.id) ?? [];
      list.push({ turn, event, message }); admissions.set(message.id, list);
    }
  }
  const fail = () => { throw Error('The native Actor exchange has no exact owned message/turn chain.'); };
  if (hops.length > 2 || new Set(hops.map(hop => hop.messageId)).size !== hops.length) fail();
  let previousBoundary = -1, firstSeq;
  const turns = new Set(), ids = new Set(hops.map(hop => hop.messageId));
  for (let index = 0; index < hops.length; index++) {
    const entries = admissions.get(hops[index].messageId), endCount = hops[index + 1]?.afterEventCount ?? boundary;
    const end = events.find(event => event.seq === endCount - 1), admission = entries?.[0];
    if (entries?.length !== 1 || admission.turn === undefined || admission.event.seq <= previousBoundary
      || end?.type !== 'turn/end' || end.data.turn !== admission.turn || admission.event.seq >= end.seq
      || end.data.reason?.kind !== (index === hops.length - 1 ? finalKind : 'completed')) fail();
    if (index > 0 && (typeof accepted.sessionId !== 'string'
      || admission.message.source?.kind !== 'agent-message' || admission.message.source.form !== 'relay'
      || admission.message.source.senderSessionId !== accepted.sessionId
      || admission.message.content?.length !== 2 || admission.message.content[0].type !== 'text'
      || admission.message.content[0].text !== `Agent ${accepted.sessionId} sent a message: `
      || admission.message.content[1].type !== 'text' || admission.message.content[1].text !== NUDGE_PROMPT)) fail();
    firstSeq ??= admission.event.seq; previousBoundary = end.seq; turns.add(admission.turn);
  }
  for (const event of events) if (event.seq >= firstSeq && event.seq < boundary) {
    if (event.type === 'turn/end' && !turns.has(event.data.turn)) fail();
    if (event.type === 'user/message' && event.surfaceOp === 'append') {
      const message = event.data.message ?? event.data;
      // Native preparation appends runtime snapshots, skill catalogs and
      // standing instructions inside a task. They are context, not a second
      // inbox delivery. Any other accepted input changes this task exchange.
      if (!ids.has(message.id) && (inboxIds.has(message.id)
        || !['snapshot', 'catalog', 'instructions'].includes(message.source?.form))) fail();
    }
  }
}
export function createAskReceipt() {
  return { currentTurn: undefined, turns: new Map(), claimed: new Map(), admitted: new Map(), discarded: new Set() };
}

export function observeAskEvent(receipt, event, textOf) {
  if (event.type === 'turn/start') {
    receipt.currentTurn = event.data.turn;
    if (!receipt.turns.has(event.data.turn)) receipt.turns.set(event.data.turn, { text: '' });
  }
  if (event.type === 'user/message' && event.surfaceOp === 'append' && receipt.currentTurn !== undefined) {
    const message = event.data.message ?? event.data;
    receipt.admitted.set(message.id, receipt.currentTurn);
  }
  if (event.type === 'assistant/message' && event.surfaceOp === 'append' && receipt.currentTurn !== undefined) {
    const owner = event.data.turn ?? receipt.currentTurn;
    const turn = receipt.turns.get(owner);
    const content = (event.data.message ?? event.data).content;
    // Fixed DSH AssistantOutputFold.push retains the last non-empty content.
    // A normal empty response after a text/tool step must not erase its answer;
    // non-empty tool/image-only content still replaces the earlier candidate.
    if (owner === receipt.currentTurn && turn && !turn.end && content?.length > 0) turn.text = textOf(content);
  }
  if (event.type === 'turn/end') {
    const turn = receipt.turns.get(event.data.turn) ?? { text: '' };
    turn.end = event.data;
    turn.eventCount = event.seq + 1;
    receipt.turns.set(event.data.turn, turn);
    if (receipt.currentTurn === event.data.turn) receipt.currentTurn = undefined;
  }
}

export function askReceiptOutcome(receipt, messageId) {
  if (messageId === undefined) return;
  if (receipt.discarded.has(messageId)) return { error: Error('Native actor accepted task was discarded before completion.') };
  const admittedTurn = receipt.admitted.get(messageId), claimedTurn = receipt.claimed.get(messageId);
  if (admittedTurn !== undefined && claimedTurn !== undefined && admittedTurn !== claimedTurn)
    return { error: Error('Native actor task claim and admission belong to different turns.') };
  const turn = admittedTurn ?? claimedTurn;
  if (turn === undefined) return;
  const facts = receipt.turns.get(turn);
  if (!facts?.end) return;
  if (facts.end.reason?.kind !== 'completed')
    return { error: Error('Native actor task ended with ' + (facts.end.reason?.kind ?? 'an unknown outcome')) };
  if (admittedTurn === undefined) return { error: Error('Native actor completed without admitting the accepted task.') };
  return { turn, ...facts };
}
