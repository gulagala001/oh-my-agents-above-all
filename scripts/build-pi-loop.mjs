import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = text => createHash('sha256').update(text).digest('hex');
export async function buildPiLoop() {
  const require = createRequire(import.meta.url);
  const sources = JSON.parse(await readFile(root + 'src/presets/pi/source.json', 'utf8'));
  const binding = sources.nativeLoopAdapter;
  const nativeLicense = await readFile(root + 'src/presets/pi/' + binding.licenseSnapshot, 'utf8');
  if (hash(nativeLicense) !== binding.licenseSha256) throw Error('Native loop license changed');
  const piLicense = await readFile(root + 'src/presets/pi/sources/LICENSE', 'utf8');
  for (const file of sources.contextAdapter.files) {
    if (hash(await readFile(root + 'src/presets/pi/' + file.snapshot)) !== file.sha256) throw Error('Pi context source changed: ' + file.snapshot);
  }
  await mkdir(root + 'lib', { recursive: true });
  const managerPath = 'sources/packages/coding-agent/src/core/session-manager.ts';
  const messagesPath = 'sources/packages/coding-agent/src/core/messages.ts';
  for (const snapshot of [managerPath, messagesPath]) {
    const file = sources.files.find(file => file.snapshot === snapshot);
    if (!file || hash(await readFile(root + 'src/presets/pi/' + snapshot)) !== file.sha256) throw Error('Pi boundary source changed: ' + snapshot);
  }
  const manager = await readFile(root + 'src/presets/pi/' + managerPath, 'utf8');
  const projection = manager.slice(manager.indexOf('function buildEntryIndex('), manager.indexOf('/** Build the finalized model context'));
  await build({ stdin: { contents: `import { createBranchSummaryMessage, createCompactionSummaryMessage, createCustomMessage } from './messages.ts';\nexport { convertToLlm } from './messages.ts';\n` + projection,
    loader: 'ts', resolveDir: root + 'src/presets/pi/sources/packages/coding-agent/src/core' },
    outfile: root + 'lib/pi-session-projection.mjs', bundle: true, platform: 'node', format: 'esm',
    banner: { js: '// Derived from the pinned Pi session-manager.ts and messages.ts.\n/*\n' + piLicense.trimEnd() + '\n*/' } });
  await build({ stdin: { contents: `export { getCurrentSystemMessage, collapseSystemMessages } from './src/presets/pi/sources/npm-pi-ai/utils/transcript.js';
    export { getSystemMessageText } from './src/presets/pi/sources/npm-pi-ai/utils/text.js';`, resolveDir: root },
    outfile: root + 'lib/pi-context-helpers.mjs', bundle: true, platform: 'node', format: 'esm',
    banner: { js: '// Derived from @earendil-works/pi-ai 1.1.0.\n/*\n' + piLicense.trimEnd() + '\n*/' } });
  const path = require.resolve(binding.package), source = await readFile(path, 'utf8');
  const manifest = JSON.parse(await readFile(require.resolve(binding.package + '/package.json'), 'utf8'));
  if (manifest.version !== binding.version || manifest.license !== binding.license || hash(source) !== binding.implementationSha256)
    throw Error('Pi native loop source changed; review the request and step seams before rebuilding.');
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  let klass;
  function visit(node) {
    if (ts.isClassExpression(node) && node.members.some(m => m.name?.getText(parsed) === 'buildRequest')) klass = node;
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  const methods = Object.fromEntries(Object.keys(binding.methods).map(name => {
    const method = klass.members.find(m => m.name?.getText(parsed) === name)?.getText(parsed);
    if (!method || hash(method) !== binding.methods[name]) throw Error('Pi native loop method changed: ' + name);
    return [name, method];
  }));
  const replace = (text, before, after) => {
    if (text.split(before).length !== 2) throw Error('Pi native loop adaptation point is missing or ambiguous: ' + before);
    return text.replace(before, after);
  };
  methods.step = replace(methods.step, 'const request = this.buildRequest(', 'const request = await this.buildRequest(');
  methods.step = replace(methods.step, 'live.start();', 'live.start();\n await this[piRequestHook].stream?.("start", live, request, signal);');
  methods.step = replace(methods.step, 'live.push(chunk);', 'live.push(chunk);\n await this[piRequestHook].stream?.("chunk", live, request, signal, chunk);');
  methods.step = replace(methods.step, 'if (finish.kind === "max-tokens")', 'await this[piRequestHook].messages?.(signal);\n if (finish.kind === "max-tokens")');
  methods.turn = replace(methods.turn, 'if (!this.inbox.hasPending) return false;', 'await this[piRequestHook].settle?.(signal);\n signal.throwIfAborted();\n if (!this.inbox.hasPending) return false;');
  methods.buildRequest = 'async ' + methods.buildRequest;
  methods.buildRequest = replace(methods.buildRequest, 'const header = canonicalHeader(', 'let header = canonicalHeader(');
  methods.buildRequest = replace(methods.buildRequest, 'deepFreeze(header);\n\t\tconst boundaryMessages = session.deriveMessages();', `let boundaryMessages = session.deriveMessages();
    let toolHistory = session.toolHistory();
    const projected = await this[piRequestHook]({ messages: boundaryMessages, tools: header.tools ?? [], toolHistory }, signal);
    signal.throwIfAborted();
    if (projected) {
      boundaryMessages = projected.messages; toolHistory = projected.toolHistory;
      const { tools: _tools, ...rest } = header;
      const nextHeader = canonicalHeader({ ...rest, ...(projected.tools.length ? { tools: projected.tools } : {}) });
      if (!headerEquals(header, nextHeader)) session.append('request/header', { header: nextHeader, reason: 'change', startsSeries: true });
      header = nextHeader;
    }
    deepFreeze(header); deepFreeze(toolHistory);`);
  methods.buildRequest = replace(methods.buildRequest, 'toolHistory: session.toolHistory(),', 'toolHistory,');
  // Keep the pinned native stream framing, error recovery and tool dispatcher.
  // Only three methods are installed on an already-owned Pi Agent; no service,
  // second driver, provider, inbox or journal is instantiated from this code.
  const prefix = source.slice(0, source.indexOf('//#region')) + source.slice(source.indexOf('//#region lib/types/assistant-stream.js'), source.indexOf('var ReactLoopAgent = class'));
  const adapted = prefix + `\nconst piRequestHook = Symbol.for('omaa.pi.request-hook');
    const methods = { ${methods.step}, ${methods.buildRequest}, ${methods.turn} };
    export { methods, piRequestHook };`;
  const result = await build({ stdin: { contents: adapted, resolveDir: root, sourcefile: 'pi-native-loop.js' },
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', minifySyntax: true, target: 'node22' });
  // Resolve every SDK import from the actual native loop installation so
  // private pnpm copies never duplicate a service or brand identity.
  let code = result.outputFiles[0].text.replace(/^import "[^"]+";\n/gm, '').replace(/import \{([^}]+)\} from "(@deepseek-ai\/[^"\n]+)";/g,
    (_all, names, specifier) => `const {${names.replace(/\bas\b/g, ':')}} = await import(nativeRequire.resolve(${JSON.stringify(specifier)}));`);
  code = `// Generated from ${binding.package}@${binding.version}; MIT, Copyright DeepSeek.
// See source.json nativeLoopAdapter and THIRD_PARTY_NOTICES.md.
/*
${nativeLicense.trimEnd()}
*/
import { createRequire } from 'node:module';
const nativeRequire = createRequire(import.meta.resolve('@deepseek-ai/dsh-agent-loop'));
` + code;
  await mkdir(root + 'lib', { recursive: true });
  await writeFile(root + 'lib/pi-native-loop.mjs', code);
  return { version: binding.version, implementationSha256: binding.implementationSha256 };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(await buildPiLoop());
