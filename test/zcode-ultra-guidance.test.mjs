import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../src/presets/zcode/prompt.mjs';

test('ZCode standing Workflow authorization is restricted to Ultra Workflow', () => {
  const tools = new Set(['workflow', 'skill']);
  for (const workSubmode of ['workflow', 'team', 'free']) {
    const prompt = buildPrompt({ tools, workMode: 'ultra', workSubmode });
    assert.equal(prompt.includes('standing choice to use workflows'), workSubmode === 'workflow');
    assert(!prompt.includes('Without such an explicit request, do not start a workflow'));
    if (workSubmode === 'team') assert(prompt.includes('DSH native Agent Team capabilities'));
  }
  assert(buildPrompt({ tools }).includes('Without such an explicit request, do not start a workflow'));
});
