import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { symbols } from '@deepseek-ai/cordis';
import { methods, piRequestHook } from '../../lib/pi-native-loop.mjs';

const binding = JSON.parse(readFileSync(new URL('../presets/pi/source.json', import.meta.url), 'utf8')).nativeLoopAdapter;
const hash = value => createHash('sha256').update(value).digest('hex');
let checked = false;
export function installPiLoop(agent, hooks) {
  const native = agent?.[symbols.original] ?? agent;
  if (!checked) {
    const require = createRequire(import.meta.url);
    if (hash(readFileSync(require.resolve(binding.package))) !== binding.implementationSha256)
      throw Error('Pi extension boundaries require the reviewed DSH loop ' + binding.version);
    checked = true;
  }
  const prior = Object.fromEntries(Object.keys(binding.methods).map(name => [name, native[name]]));
  if (native[piRequestHook] || Object.entries(prior).some(([name, fn]) => typeof fn !== 'function'
    || hash(Function.prototype.toString.call(fn)) !== binding.methods[name])) throw Error('Pi native loop boundary is already changed or unsupported');
  const request = async (value, signal) => hooks.request(value, signal);
  request.stream = hooks.stream;
  request.messages = hooks.messages;
  request.settle = hooks.settle;
  const step = async function(decision) {
    const firstSeq = native.session.seq;
    const result = await methods.step.call(native, decision);
    return hooks.afterStep ? await hooks.afterStep(firstSeq, result, native.phase.abort.signal) : result;
  };
  native[piRequestHook] = request;
  native.step = step; native.buildRequest = methods.buildRequest; native.turn = methods.turn;
  return () => {
    if (native.step === step) native.step = prior.step;
    if (native.buildRequest === methods.buildRequest) native.buildRequest = prior.buildRequest;
    if (native.turn === methods.turn) native.turn = prior.turn;
    if (native[piRequestHook] === request) delete native[piRequestHook];
  };
}
