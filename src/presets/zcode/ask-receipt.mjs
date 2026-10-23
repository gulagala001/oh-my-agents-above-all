// One accepted ask can finish before its delivery RPC returns. Retain each
// native turn's facts and bind the accepted message to its own consumed turn.
// A later unrelated turn must not replace its terminal reason or result text.
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
