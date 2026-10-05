import codex from './sources/codex-desktop.json' with { type: 'json' };
import grok from './sources/grok-build.json' with { type: 'json' };
import zcode from './sources/zcode.json' with { type: 'json' };
import pi from './sources/pi/palette.json' with { type: 'json' };

// Product colors come from pinned native roles. These geometry values are the
// web adapter's shell defaults, not claims about terminal cell/pixel dimensions.
const common = { ...codex.tokens.common, 'radius-composer': '12px', 'radius-panel': '10px', shadow: 'none' };
const grokMap = { bg: 'bg_terminal', surface: 'bg_base', 'surface-solid': 'bg_base', sidebar: 'bg_dark',
  text: 'text_primary', muted: 'text_secondary', border: 'prompt_border', hover: 'bg_hover', selected: 'bg_highlight',
  accent: 'accent_system', 'on-accent': 'bg_terminal', focus: 'prompt_border_active', success: 'accent_success', warning: 'warning',
  danger: 'accent_error', 'code-bg': 'md_code_bg', 'user-bg': 'bg_base', 'user-text': 'text_primary' };
const zcodeMap = { bg: 'background', surface: 'panel', 'surface-solid': 'panel', sidebar: 'sidebar', text: 'foreground',
  muted: 'foreground-subtle', border: 'border', hover: 'hover', selected: 'selected', accent: 'brand', 'on-accent': 'primary-foreground',
  focus: 'brand', success: 'success', warning: 'warning', danger: 'destructive', 'code-bg': 'markdown-inline-code',
  'user-bg': 'selected', 'user-text': 'foreground' };
// Pi's export backgrounds are its official browser palette. Terminal canvas
// colors are dynamic and are deliberately not claimed by this browser mapping.
const piMap = { bg: 'export.pageBg', surface: 'export.cardBg', 'surface-solid': 'export.cardBg', sidebar: 'export.pageBg',
  text: 'text', muted: 'muted', border: 'borderMuted', hover: 'selectedBg', selected: 'selectedBg', accent: 'accent',
  'on-accent': 'export.pageBg', focus: 'borderAccent', success: 'success', warning: 'warning', danger: 'error',
  'code-bg': 'export.cardBg', 'user-bg': 'userMessageBg', 'user-text': 'userMessageText' };
const mapped = (map, read) => Object.fromEntries(Object.entries(map).map(([key, native]) => {
  const value = read(native)?.browserValue;
  if (!value) throw new Error(`Missing verified native theme role: ${native}`);
  return [key, value];
}));

// Cursor's IDE supports user-selected themes. Inheriting DSH colors is this
// adapter's choice, not a claim about a fixed IDE or Agents Window palette.
const cursorRoles = { bg: 'bg-base', surface: 'bg-layer-1', 'surface-solid': 'bg-layer-2', sidebar: 'bg-base',
  text: 'label-primary', muted: 'label-secondary', border: 'border-l2', hover: 'interactive-bg-hover',
  selected: 'interactive-bg-active', accent: 'brand-primary', 'on-accent': 'label-primary-foreground',
  focus: 'brand-primary', success: 'state-success-primary', warning: 'state-warn-primary', danger: 'state-error-primary',
  'code-bg': 'markdown-code-block', 'user-bg': 'bg-layer-2', 'user-text': 'label-primary' };
const cursorPalette = Object.fromEntries(Object.entries(cursorRoles).map(([role, alias]) => [role, `var(--dsw-alias-${alias})`]));

export const themePacks = [codex, {
  schemaVersion: 1, id: 'grok-build', name: 'Grok Build', version: '1.0.0',
  tokens: { common: { ...common, 'font-ui': common['font-mono'], 'font-body': common['font-mono'], 'radius-control': '3px', 'radius-panel': '3px', 'radius-composer': '3px' },
    ...Object.fromEntries(['light', 'dark'].map(mode => [mode, mapped(grokMap, key => grok.variants[mode].roles[key])])) },
  css: '',
}, {
  schemaVersion: 1, id: 'zcode', name: 'ZCode · ZAI', version: '1.0.0',
  tokens: { common, light: mapped(zcodeMap, key => zcode.variants.zaiLight.tokens['--color-' + key]),
    dark: mapped(zcodeMap, key => zcode.variants.zaiDark.tokens['--color-' + key]) }, css: '',
}, {
  schemaVersion: 1, id: 'pi-coding-agent', name: 'Pi Coding Agent', version: '1.0.0',
  tokens: { common: { ...common, 'font-ui': common['font-mono'], 'font-body': common['font-mono'], 'radius-control': '3px', 'radius-panel': '3px', 'radius-composer': '3px' },
    ...Object.fromEntries(['light', 'dark'].map(mode => [mode, mapped(piMap, key => pi.variants[mode].palette[key])])) },
  css: '',
}, {
  schemaVersion: 1, id: 'cursor-cli', name: 'Cursor · Agent 对话', version: '1.1.0', inheritsHost: true, layout: 'cursor-agent',
  provenance: { source: 'sources/cursor/agent-window.json', scope: 'IDE Agent pane and Agents Window public references',
    palette: 'host inheritance is an adapter choice', cliReference: 'sources/cursor/provenance.json', fixedProductPalette: false },
  tokens: { common: { ...common, 'font-size': '13px', 'line-height': '1.6',
    'radius-control': '6px', 'radius-panel': '8px', 'radius-composer': '10px' }, light: { ...cursorPalette }, dark: { ...cursorPalette } }, css: '',
}];
export const productThemes = Object.freeze({ codex: 'codex-desktop', grok: 'grok-build', cursor: 'cursor-cli', zcode: 'zcode', pi: 'pi-coding-agent' });
