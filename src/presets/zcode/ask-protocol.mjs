import { handleSubmitAttempted, handleTurnEnded, REPAIR_ATTEMPTS, NUDGE_ATTEMPTS } from '../../../lib/zcode-ask-protocol.mjs';
import { validate } from '../../../lib/zcode-workflow-validate.mjs';

// Adapt only the pure fixed scheduler seam. Native tool success and turn/end
// remain authoritative for committing a value; this decision is not a receipt.
export function createAskProtocol(spec) {
  const node = { spec, repairsRemaining: REPAIR_ATTEMPTS, nudgesRemaining: NUDGE_ATTEMPTS, settled: false };
  let decision, events;
  const seam = {
    host: { validate, driver: {
      respondToSubmit(_instance, verdict) { decision = verdict; },
      cancelAsk() {}, // DSH concludes the owned turn after its error tool result.
    }, record(event) { events.push(event); } },
    liveNode: () => node,
    settleOk(_node, value) { decision = { kind: 'accept', value }; },
    settleFailed(_node, error) { node.settled = true; decision = { kind: 'fail', error }; },
  };
  const run = (action, value) => {
    if (node.settled) throw Error('This task exhausted its result protocol.');
    decision = undefined; events = [];
    action(seam, {}, value);
    if (!decision) throw Error('The fixed result protocol returned no decision.');
    return { ...decision, events };
  };
  return { submit: value => run(handleSubmitAttempted, value), turnEnded: text => run(handleTurnEnded, text) };
}
