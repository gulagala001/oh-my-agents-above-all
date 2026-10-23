// Fixed Grok truncate_str uses a UTF-8 byte cap without an ellipsis.
const PREVIEW_BYTES = 4000;

function text(value) {
  if (typeof value !== 'string') throw TypeError('Completion text must be a string.');
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw TypeError('Completion text contains ill-formed UTF-16.');
    } else if (unit >= 0xdc00 && unit <= 0xdfff) throw TypeError('Completion text contains ill-formed UTF-16.');
  }
  return value;
}

function addBytes(total, count) {
  const sum = total + count;
  if (!Number.isSafeInteger(sum)) throw RangeError('Completion byte length exceeds the safe integer range.');
  return sum;
}

export function completionTextBlocks(output) {
  if (!Array.isArray(output)) throw TypeError('Completion output must be an array.');
  return output.filter(block => {
    if (block?.type !== 'text') return false;
    return text(block.text).length > 0;
  });
}

export function completionBytes(blocks) {
  return completionTextBlocks(blocks).reduce((total, block) => addBytes(total, Buffer.byteLength(block.text)), 0);
}

function settlementSummary(childId, stopReason, continuable) {
  const subject = `Background subagent ${childId}`;
  switch (stopReason) {
    case 'completed': return continuable
      ? `${subject} finished and will do no further work unless you send it more.`
      : `${subject} finished. It cannot receive follow-up messages.`;
    case 'aborted': return `${subject} was stopped before it finished.`;
    case 'max-tokens': return `${subject} ran out of room before it finished.`;
    case 'refusal': return `${subject} declined the task.`;
    case 'error': return `${subject} failed before it finished.`;
    default: return `${subject} ended abnormally (${String(stopReason)}) before it finished.`;
  }
}

export function nativeSettlementContent(childId, result, continuable = true) {
  // Match native notice construction even for strings that cannot be safely
  // byte-paged. Strict Unicode checks belong to preview proof, where failure
  // retains this complete notice rather than discarding a captured result.
  const closing = result.output.filter(block => block.type === 'text' && block.text.length > 0);
  const content = [{ type: 'text', text: settlementSummary(childId, result.stopReason, continuable) },
    ...(closing.length ? [{ type: 'text', text: 'Its closing message:' }, ...closing]
      : [{ type: 'text', text: 'It left no closing message.' }])];
  if (result.structured !== undefined) content.push({ type: 'text', text: `Structured result: ${JSON.stringify(result.structured)}` });
  if (result.diagnostic !== undefined) content.push({ type: 'text', text: result.diagnostic });
  return content;
}

// Walk only the bounded prefix; no complete output Buffer or concatenation.
function prefix(value, budget) {
  let end = 0, bytes = 0;
  while (end < value.length) {
    const point = value.codePointAt(end);
    const size = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes + size > budget) break;
    bytes += size;
    end += point > 0xffff ? 2 : 1;
  }
  return { value: end === value.length ? value : value.slice(0, end), bytes, end };
}

export function capClosingContent(content, start, count, footer) {
  if (!Array.isArray(content) || !Number.isSafeInteger(start) || !Number.isSafeInteger(count)
    || start < 0 || count < 0 || count > content.length || start > content.length - count)
    throw RangeError('Invalid closing content span.');
  text(footer);
  const closing = content.slice(start, start + count);
  if (closing.some(block => block?.type !== 'text')) throw TypeError('Closing content must contain only text blocks.');
  const fullBytes = completionBytes(closing);
  if (fullBytes <= PREVIEW_BYTES) return { content, fullBytes, shownBytes: fullBytes, truncated: false };
  const capped = [];
  let shownBytes = 0;
  for (const block of closing) {
    const cut = prefix(block.text, PREVIEW_BYTES - shownBytes);
    if (cut.value.length) capped.push(cut.end === block.text.length ? block : { ...block, text: cut.value });
    shownBytes += cut.bytes;
    // A partial code point ends the entire concatenated prefix, even when a
    // later block starts with a smaller character that would fit the budget.
    if (cut.end !== block.text.length) break;
  }
  const marker = `[output truncated: ${shownBytes} of ${fullBytes} bytes shown]`;
  return { content: [...content.slice(0, start), ...capped,
    { type: 'text', text: marker + '\n' + footer }, ...content.slice(start + count)],
  fullBytes, shownBytes, truncated: true };
}

export function closingOutputPage(blocks, offset = 0, limit = 16384) {
  if (!Number.isSafeInteger(offset) || offset < 0) throw RangeError('Invalid completion byte offset.');
  if (!Number.isSafeInteger(limit) || limit < 4 || limit > 32768) throw RangeError('Completion page limit must be 4 through 32768.');
  const closing = completionTextBlocks(blocks), totalBytes = completionBytes(closing);
  if (offset > totalBytes) throw RangeError('Completion byte offset exceeds the output.');
  let skipped = 0, shownBytes = 0;
  const parts = [];
  for (const block of closing) {
    const blockBytes = Buffer.byteLength(block.text);
    if (skipped + blockBytes <= offset) { skipped += blockBytes; continue; }
    let index = 0, localBytes = 0;
    while (skipped + localBytes < offset) {
      const point = block.text.codePointAt(index);
      localBytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
      index += point > 0xffff ? 2 : 1;
    }
    if (skipped + localBytes !== offset && skipped < offset) throw RangeError('Completion offset must be a UTF-8 code point boundary.');
    const cut = prefix(block.text.slice(index), limit - shownBytes);
    if (cut.value.length) parts.push(cut.value);
    shownBytes += cut.bytes;
    if (index + cut.end !== block.text.length) break;
    skipped += blockBytes;
  }
  const nextOffset = offset + shownBytes;
  return { offset, nextOffset, totalBytes, done: nextOffset === totalBytes, text: parts.join('') };
}
