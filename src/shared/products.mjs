export const products = Object.freeze([
  { id: 'codex', name: 'Codex', preset: 'omaa-codex', theme: 'codex-desktop' },
  { id: 'grok', name: 'Grok Build', preset: 'omaa-grok', theme: 'grok-build' },
  { id: 'cursor', name: 'Cursor', preset: 'omaa-cursor', theme: 'cursor-cli' },
  { id: 'pi', name: 'Pi Coding Agent', preset: 'omaa-pi', theme: 'pi-coding-agent' },
  { id: 'zcode', name: 'ZCode', preset: 'omaa-zcode', theme: 'zcode' },
]);
export const productForPreset = preset => products.find(product => product.preset === preset);
