import { createRequire } from 'node:module';
import { Context } from '@deepseek-ai/cordis';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import SessionStore from '@deepseek-ai/dsh-session';
import LlmRuntime from '@deepseek-ai/dsh-llm';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import Tools from '@deepseek-ai/dsh-tools';

// Resolve the loop's own registries so the fixture always uses the same SDK
// instance and scope symbols as the installed host, including host variants.
const require = createRequire(import.meta.resolve('@deepseek-ai/dsh-agent-loop'));
const { default: AgentRegistry } = require('@deepseek-ai/dsh-agent');
const { default: SessionProjections } = require('@deepseek-ai/dsh-session-projection');

export async function presetHost(t) {
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  for (const service of [LlmRuntime, SessionStore, SessionProjections, SystemPrompt, Tools, AgentRegistry]) {
    await ctx.plugin(service);
  }
  await ctx.plugin(AgentLoop, { agents: [] });
  return ctx;
}
