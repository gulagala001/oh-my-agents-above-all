import { HarnessError } from '@deepseek-ai/dsh-llm';

export function conversionError(code, message, cause) {
  const error = new HarnessError(message, code);
  error.name = 'GrokConversionError';
  if (cause !== undefined) error.cause = cause;
  return error;
}

// Interpret only the active provider's public rule vocabulary. A bounded
// stderr tail with no positive match remains an ordinary conversion failure;
// absence of evidence never proves a runner failure or a policy denial.
export function classifyNativeFailure(exitCode, captured, confined) {
  if (exitCode === null || exitCode === 0) return undefined;
  let stderr = captured?.text ?? '';
  // A lossy tail can start inside an informational/fatal line. Discard that
  // uncertain first line before interpreting any provider diagnostic rules.
  if (captured?.lossy) { const newline = stderr.indexOf('\n'); stderr = newline < 0 ? '' : stderr.slice(newline + 1); }
  const lines = stderr.split(/\r?\n/).map(line => line.toLowerCase());
  const runnerFailed = confined.runnerFailureRules.some(rule => {
    if (rule.allowedExitCodes !== undefined && !rule.allowedExitCodes.includes(exitCode)) return false;
    const ignored = new Set((rule.informationalLines ?? []).map(line => line.toLowerCase()));
    const signatures = rule.fatalSignatures.filter(text => text.trim()).map(text => text.toLowerCase());
    return lines.some(line => !ignored.has(line) && signatures.some(text => line.includes(text)));
  });
  if (runnerFailed) return 'runner';
  const lowered = stderr.toLowerCase();
  return confined.denialSignatures.some(text => text.trim() && lowered.includes(text.toLowerCase())) ? 'denied' : undefined;
}
