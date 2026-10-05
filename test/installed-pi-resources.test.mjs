import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { installedHost, until, textReply, toolReply } from './fixtures/installed-host.mjs';

const text = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');
const system = payload => payload.messages.filter(message => message.role === 'system').map(text).join('\n');
const user = payload => payload.messages.filter(message => message.role === 'user').map(text).join('\n');
const lastUser = payload => text(payload.messages.findLast(message => message.role === 'user'));

test('installed Pi loads project system/addendum, expands template inputs once, and uses native skill provider', { timeout: 180000 }, async t => {
  const f = await installedHost(t, { piResources: true });
  await mkdir(join(f.workspace, '.pi/prompts'), { recursive: true });
  await mkdir(join(f.workspace, '.pi/skills/pi-local'), { recursive: true });
  await mkdir(join(f.workspace, '.pi/skills/pi-hidden'), { recursive: true });
  await mkdir(join(f.workspace, '.pi/skills/pi-kept'), { recursive: true });
  await mkdir(join(f.piAgentDir, 'prompts'), { recursive: true });
  await mkdir(join(f.piAgentDir, 'skills/pi-local'), { recursive: true });
  await mkdir(join(f.workspace, '.pi/custom-skills/pi-settings'), { recursive: true });
  await mkdir(join(f.workspace, '.pi/custom-prompts'), { recursive: true });
  await mkdir(join(f.workspace, '.pi/local-package/resources/skills/pi-package'), { recursive: true });
  await mkdir(join(f.workspace, '.pi/local-package/resources/prompts'), { recursive: true });
  await writeFile(join(f.workspace, '.pi/settings.json'), JSON.stringify({ skills: ['custom-skills'], prompts: ['custom-prompts'], packages: ['./local-package'] }));
  await writeFile(join(f.workspace, '.pi/custom-skills/pi-settings/SKILL.md'), '---\nname: pi-settings\ndescription: PI_SETTINGS_SKILL_CATALOG\n---\nPI_SETTINGS_BODY');
  await writeFile(join(f.workspace, '.pi/custom-prompts/configured.md'), 'PI_CONFIGURED_TEMPLATE $1');
  await writeFile(join(f.workspace, '.pi/local-package/package.json'), JSON.stringify({ pi: { skills: ['resources/skills/*'], prompts: ['resources/prompts/*.md'], extensions: ['must-not-execute.js'] } }));
  await writeFile(join(f.workspace, '.pi/local-package/resources/skills/pi-package/SKILL.md'), '---\nname: pi-package\ndescription: PI_PACKAGE_SKILL_CATALOG\n---\nPI_PACKAGE_BODY_LITERAL');
  await writeFile(join(f.workspace, '.pi/local-package/resources/prompts/packaged.md'), 'PI_PACKAGE_TEMPLATE $1');
  await writeFile(join(f.workspace, '.pi/local-package/must-not-execute.js'), 'throw new Error("PI_EXTENSION_MUST_NOT_EXECUTE");');
  await writeFile(join(f.piAgentDir, 'SYSTEM.md'), 'PI_GLOBAL_SYSTEM_FALLBACK');
  await writeFile(join(f.piAgentDir, 'APPEND_SYSTEM.md'), 'PI_GLOBAL_APPEND_FALLBACK');
  await writeFile(join(f.piAgentDir, 'AGENTS.override.md'), 'PI_GLOBAL_OVERRIDE_RULE {{literal}}');
  await writeFile(join(f.piAgentDir, 'AGENTS.md'), 'PI_GLOBAL_SHADOWED_AGENTS_MUST_NOT_LOAD');
  await writeFile(join(f.workspace, 'AGENTS.md'), 'PI_NATIVE_PROJECT_RULE');
  await writeFile(join(f.piAgentDir, 'prompts/check.md'), 'PI_USER_COLLISION_MUST_NOT_WIN');
  await writeFile(join(f.workspace, '.pi/SYSTEM.md'), 'PI_CUSTOM_PERSONA {{literal}}\nFollow the actual user request.');
  await writeFile(join(f.workspace, '.pi/APPEND_SYSTEM.md'), 'PI_APPEND_LITERAL {{literal}}');
  await writeFile(join(f.workspace, '.pi/prompts/check.md'), '---\ndescription: A literal resource probe\nargument-hint: "<file> [focus]"\n---\nPI_TEMPLATE $1 | ${2:-fallback} | ${@:2:2} | $ARGUMENTS');
  await writeFile(join(f.workspace, '.pi/prompts/outer.md'), '/check $1');
  await writeFile(join(f.piAgentDir, 'skills/pi-local/SKILL.md'), '---\nname: pi-local\ndescription: PI_USER_SKILL_COLLISION\n---\nPI_USER_SKILL_BODY_MUST_NOT_WIN');
  await writeFile(join(f.workspace, '.pi/skills/pi-local/SKILL.md'), '---\nname: pi-local\ndescription: PI_SKILL_CATALOG_DESCRIPTION\n---\nPI_SKILL_BODY_LITERAL\nRead the requested file.');
  await writeFile(join(f.workspace, '.pi/skills/.gitignore'), 'pi-hidden/\npi-kept/\n');
  await writeFile(join(f.workspace, '.pi/skills/.fdignore'), '!pi-kept/\n');
  await writeFile(join(f.workspace, '.pi/skills/pi-hidden/SKILL.md'), '---\nname: pi-hidden\ndescription: PI_IGNORED_CATALOG_MUST_NOT_LOAD\n---\nPI_IGNORED_BODY');
  await writeFile(join(f.workspace, '.pi/skills/pi-kept/SKILL.md'), '---\nname: pi-kept\ndescription: PI_NEGATED_CATALOG\n---\nPI_NEGATED_BODY');
  await mkdir(join(f.workspace, '.git'));
  await f.install(); await f.boot();
  const session = await f.create('omaa-pi');
  const start = f.requests.length;
  await f.prompt(session.sessionId, '/check "source file.ts"');
  const first = f.requests.slice(start).find(payload => payload.tools?.length);
  assert(first);
  assert(system(first).includes('PI_CUSTOM_PERSONA {{literal}}'));
  assert(system(first).includes('PI_APPEND_LITERAL {{literal}}'));
  assert(!system(first).includes('You are an expert coding assistant operating inside DSH with the Pi Coding Agent preset'));
  assert(system(first).includes('PI_GLOBAL_OVERRIDE_RULE {{literal}}'));
  assert(!JSON.stringify(first.messages).includes('PI_GLOBAL_SHADOWED_AGENTS_MUST_NOT_LOAD'));
  assert.equal(JSON.stringify(first.messages).split('PI_NATIVE_PROJECT_RULE').length - 1, 1, 'native project instructions are not duplicated by Pi resources');
  assert(user(first).includes('PI_SKILL_CATALOG_DESCRIPTION'), 'native tool-skill publishes its catalog as a user system-reminder');
  assert(!JSON.stringify(first.messages).includes('PI_SKILL_BODY_LITERAL'), 'skill bodies remain lazy');
  assert(!JSON.stringify(first.messages).includes('PI_USER_SKILL_COLLISION'), 'default CLI project resource precedence is preserved');
  assert(!JSON.stringify(first.messages).includes('PI_IGNORED_CATALOG_MUST_NOT_LOAD'));
  assert(user(first).includes('PI_NEGATED_CATALOG'));
  assert(user(first).includes('PI_SETTINGS_SKILL_CATALOG'));
  assert(user(first).includes('PI_PACKAGE_SKILL_CATALOG'));
  assert(!JSON.stringify(first.messages).includes('PI_PACKAGE_BODY_LITERAL'));
  assert(user(first).includes('PI_TEMPLATE source file.ts | fallback |  | source file.ts'));
  const commands = await f.call('commands/list', { agentId: session.sessionId });
  assert(commands.some(command => command.name === 'check' && command.input?.hint === '<file> [focus]'));
  assert(commands.some(command => command.name === 'configured'));
  assert(commands.some(command => command.name === 'packaged'));

  const commandFrom = f.requests.length;
  await f.call('commands/execute', { agentId: session.sessionId, line: '/check alpha beta gamma', submittedAttachments: [] });
  await until(async () => (await f.snapshot(session.sessionId)).records.some(record => record.event?.type === 'user/message' && JSON.stringify(record.event.data).includes('PI_TEMPLATE alpha | beta | beta gamma | alpha beta gamma')));
  await until(async () => !(await f.api(session.sessionId)).value.running);
  assert(f.requests.slice(commandFrom).some(payload => lastUser(payload).includes('PI_TEMPLATE alpha | beta | beta gamma | alpha beta gamma')));

  const outerFrom = f.requests.length;
  await f.prompt(session.sessionId, '/outer "not recursive"');
  assert(f.requests.slice(outerFrom).some(payload => lastUser(payload) === '/check not recursive'));

  const skillFrom = f.requests.length;
  let phase = 0;
  f.replyWith(payload => payload.tools?.length && phase++ === 0 ? toolReply('skill', { name: 'pi-local' }) : textReply('Native Pi skill loaded.'));
  const skillSnapshot = await f.prompt(session.sessionId, 'PI_ACTUAL_SKILL: load pi-local with skill.');
  assert(f.requests.slice(skillFrom).some(payload => payload.messages.some(message => message.role === 'tool' && text(message).includes('PI_SKILL_BODY_LITERAL'))));
  assert(skillSnapshot.records.some(record => record.event?.type === 'tool/result' && JSON.stringify(record.event.data).includes('PI_SKILL_BODY_LITERAL')));
  f.replyWith();

  const packageFrom = f.requests.length; let packagePhase = 0;
  f.replyWith(payload => payload.tools?.length && packagePhase++ === 0 ? toolReply('skill', { name: 'pi-package' }) : textReply('Local resource package loaded.'));
  await f.prompt(session.sessionId, '/packaged local-package-argument');
  assert(f.requests.slice(packageFrom).some(payload => user(payload).includes('PI_PACKAGE_TEMPLATE local-package-argument')));
  assert(f.requests.slice(packageFrom).some(payload => payload.messages.some(message => message.role === 'tool' && text(message).includes('PI_PACKAGE_BODY_LITERAL'))));
  f.replyWith();
  const configuredFrom = f.requests.length;
  await f.prompt(session.sessionId, '/configured local-settings-argument');
  assert(f.requests.slice(configuredFrom).some(payload => lastUser(payload) === 'PI_CONFIGURED_TEMPLATE local-settings-argument'));

  // External ignore edits invalidate the Pi registration using native versions;
  // the ordinary native skill watchers do not recognize ignore filenames.
  await writeFile(join(f.workspace, '.pi/skills/.fdignore'), '!pi-kept/\n!pi-hidden/\n');
  const ignoreRefreshFrom = f.requests.length;
  await f.prompt(session.sessionId, 'PI_IGNORE_RESOURCE_REFRESH');
  assert(f.requests.slice(ignoreRefreshFrom).some(payload => user(payload).includes('PI_IGNORED_CATALOG_MUST_NOT_LOAD')));
  await writeFile(join(f.workspace, '.pi/skills/.fdignore'), '!pi-kept/\n');
  const ignoreRestored = await f.prompt(session.sessionId, 'PI_IGNORE_RESOURCE_RESTORE');
  const currentCatalog = ignoreRestored.records.findLast(record => record.event?.type === 'user/message' && record.event.data.source?.kind === 'skill-catalog');
  assert(currentCatalog && !JSON.stringify(currentCatalog.event.data).includes('PI_IGNORED_CATALOG_MUST_NOT_LOAD'));

  // Actual CLI defaults inherit .agents/skills, not ancestor .pi/skills.
  const nestedCwd = join(f.workspace, 'app/sub');
  await mkdir(join(nestedCwd, '.pi/skills/group/deeper/nested-native'), { recursive: true });
  await mkdir(join(f.workspace, '.agents/skills/ancestor-native'), { recursive: true });
  await mkdir(join(f.root, '.agents/skills/outside-native'), { recursive: true });
  const skill = (file, name, description, body) => writeFile(file, `---\nname: ${name}\ndescription: ${description}\n---\n${body}`);
  await skill(join(nestedCwd, '.pi/skills/group/deeper/nested-native/SKILL.md'), 'nested-native', 'DEEP_NATIVE_CATALOG', 'DEEP_NATIVE_BODY');
  await skill(join(f.workspace, '.agents/skills/ancestor-native/SKILL.md'), 'ancestor-native', 'ANCESTOR_NATIVE_CATALOG', 'ANCESTOR_NATIVE_BODY');
  await skill(join(f.root, '.agents/skills/outside-native/SKILL.md'), 'outside-native', 'OUTSIDE_GIT_MUST_NOT_LOAD', 'Outside git root');
  const nested = await f.rpc('session/create', { cwd: nestedCwd, agentPreset: 'omaa-pi' }), nestedFrom = f.requests.length;
  let nestedPhase = 0;
  f.replyWith(payload => payload.tools?.length && nestedPhase++ === 0 ? toolReply('skill', { name: 'nested-native' }) : textReply('Nested native skill loaded.'));
  await f.prompt(nested.sessionId, 'PI_NESTED_AND_ANCESTOR_NATIVE');
  const nestedRequests = f.requests.slice(nestedFrom);
  assert(nestedRequests.some(payload => user(payload).includes('DEEP_NATIVE_CATALOG') && user(payload).includes('ANCESTOR_NATIVE_CATALOG')));
  assert(nestedRequests.every(payload => !JSON.stringify(payload.messages).includes('OUTSIDE_GIT_MUST_NOT_LOAD')));
  assert(nestedRequests.every(payload => !JSON.stringify(payload.messages).includes('PI_SKILL_CATALOG_DESCRIPTION')), 'ancestor .pi/skills must not be invented');
  assert(nestedRequests.some(payload => payload.messages.some(message => message.role === 'tool' && text(message).includes('DEEP_NATIVE_BODY'))));
  f.replyWith();

  // Native steer/queue input passes through the same expansion without another loop.
  const held = f.holdNextReply(), inboxFrom = f.requests.length;
  await f.send(session.sessionId, 'PI_RESOURCE_BOUNDARY');
  await until(() => f.requests.length > inboxFrom);
  await f.send(session.sessionId, '/check steer focus', 'steer');
  await f.send(session.sessionId, '/check queued', 'queue');
  held();
  await until(async () => {
    const snapshot = await f.snapshot(session.sessionId);
    const prompts = snapshot.records.filter(record => record.event?.type === 'user/message').map(record => JSON.stringify(record.event.data));
    return prompts.some(item => item.includes('PI_TEMPLATE steer | focus')) && prompts.some(item => item.includes('PI_TEMPLATE queued | fallback'));
  });
  await until(async () => !(await f.api(session.sessionId)).value.running);
  assert(f.requests.slice(inboxFrom).some(payload => user(payload).includes('PI_TEMPLATE steer | focus')));
  assert(f.requests.slice(inboxFrom).some(payload => user(payload).includes('PI_TEMPLATE queued | fallback')));

  // Resource refresh removes SYSTEM without losing the complete source persona.
  await rm(join(f.workspace, '.pi/SYSTEM.md'));
  const refreshFrom = f.requests.length;
  await f.prompt(session.sessionId, 'PI_RESOURCE_REFRESH');
  assert(f.requests.slice(refreshFrom).some(payload => system(payload).includes('PI_GLOBAL_SYSTEM_FALLBACK') && system(payload).includes('PI_APPEND_LITERAL')));
  await rm(join(f.piAgentDir, 'SYSTEM.md'));
  const defaultFrom = f.requests.length;
  await f.prompt(session.sessionId, 'PI_RESOURCE_DEFAULT_REFRESH');
  assert(f.requests.slice(defaultFrom).some(payload => system(payload).includes('You are an expert coding assistant operating inside DSH with the Pi Coding Agent preset') && system(payload).includes('PI_APPEND_LITERAL')));
  await rm(join(f.workspace, '.pi/APPEND_SYSTEM.md'));
  const appendFrom = f.requests.length;
  await f.prompt(session.sessionId, 'PI_RESOURCE_APPEND_FALLBACK');
  assert(f.requests.slice(appendFrom).some(payload => system(payload).includes('PI_GLOBAL_APPEND_FALLBACK')));
  const stock = await f.create('standard'), stockFrom = f.requests.length;
  await f.prompt(stock.sessionId, 'STOCK_SCOPE_RESOURCE_PROBE');
  assert(f.requests.slice(stockFrom).every(payload => !system(payload).includes('PI_APPEND_LITERAL')));
  assert.deepEqual(f.errors, []);
});
