import { build as esbuild } from 'esbuild';
import { fileURLToPath } from 'node:url';

export const build = options => esbuild({ ...options, alias: {
  '@deepseek-ai/dsh-client-ui-primitives': fileURLToPath(new URL('./primitive-controls.jsx', import.meta.url)),
  ...options.alias,
} });
