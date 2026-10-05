import { createThemeRuntime } from './runtime.mjs';
import { applyCodexIntegration } from './shared/codex-integration.jsx';
import adapterCss from './shared/adapter.css';
import codexCss from './shared/codex-layout.css';
import responsiveCss from './responsive.css';
import cursorAgentCss from './cursor-agent.css';

export function applyThemes(ctx, settings) {
  let runtime;
  ctx.effect(() => {
    runtime = createThemeRuntime(ctx, settings, adapterCss, { 'codex-desktop': codexCss, 'cursor-agent': cursorAgentCss }, responsiveCss);
    return () => runtime.dispose();
  });
  applyCodexIntegration(ctx, () => runtime);
  return () => runtime;
}
