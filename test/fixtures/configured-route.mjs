import { readFile } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { load, JSON_SCHEMA, Type } from 'js-yaml';

// Parse the profile's JS scalars as inert strings. Never evaluate configuration code.
const schema = JSON_SCHEMA.extend([new Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: value => value }), new Type('!js', { kind: 'scalar', construct: value => value })]);
const fail = message => new Error('Configured DSH route: ' + message);
async function yaml(file) { const text = await readFile(file, 'utf8'); if (Buffer.byteLength(text) > 4 * 1024 * 1024) throw fail('configuration exceeds read budget'); try { return load(text, { schema }); } catch { throw fail('invalid YAML configuration'); } }
function entries(tree) { if (!Array.isArray(tree)) throw fail('profile patch must be a plugin list'); return tree.flatMap(row => row && typeof row === 'object' ? [row, ...row.group === true ? entries(row.config) : []] : []); }

export async function loadConfiguredRoute({
  home = process.env.OMAA_CONFIGURED_DSH_HOME,
  profile = process.env.OMAA_CONFIGURED_PROFILE ?? 'trisoul-x',
  providerId = process.env.OMAA_CONFIGURED_PROVIDER ?? 'opencode-zen',
  model = process.env.OMAA_CONFIGURED_MODEL ?? 'space-bunny-free',
} = {}) {
  if (!home || !isAbsolute(home)) throw fail('an absolute configured DSH home is required');
  if (!/^[\w.-]+$/.test(profile) || profile === '..') throw fail('invalid profile name');
  const rows = entries(await yaml(join(home,'profiles',profile,'cordis.patch.yml')));
  const definitions = rows.filter(row => ['llm-pi-ai','@deepseek-ai/dsh-llm-pi-ai'].includes(row.name));
  const provider = definitions.map(row => row.config?.providers?.[providerId]).find(Boolean);
  if (!provider || provider.api !== 'openai-completions') throw fail('requested OpenAI Completions provider unavailable');
  const definition = provider.models?.find(entry => entry.id === model);
  if (!definition) throw fail('requested model unavailable in the selected profile');
  if (typeof provider.baseURL !== 'string' || !provider.baseURL || typeof provider.apiKeyEnv !== 'string') throw fail('provider route is incomplete');
  let url; try { url = new URL(provider.baseURL); } catch { throw fail('invalid provider URL'); }
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw fail('unsupported provider URL');
  const credentials = await yaml(join(home,'.credentials.yaml'));
  const apiKey = credentials?.refs?.[provider.apiKeyEnv] ?? process.env[provider.apiKeyEnv];
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw fail('selected provider credential unavailable');
  return { providerId, model, api: provider.api, baseUrl: provider.baseURL, apiKey,
    apiKeyEnv: provider.apiKeyEnv, compat: provider.compat, streamIdleTimeoutMs: provider.streamIdleTimeoutMs,
    modelDefinition: structuredClone(definition), contextWindow: definition.contextWindow, maxTokens: definition.maxTokens,
  };
}

/** Minimal opt-in availability request. No endpoint, key or response body enters evidence/errors. */
export async function probeConfiguredRoute(route, { timeoutMs = 60000 } = {}) {
  const started = Date.now();
  try {
    const response = await fetch(route.baseUrl.replace(/\/$/,'')+'/chat/completions', {
      method:'POST', headers:{'content-type':'application/json',authorization:'Bearer '+route.apiKey},
      body:JSON.stringify({model:route.model,messages:[{role:'user',content:'Reply with exactly OMAA_ROUTE_READY.'}],max_tokens:64,stream:false}),
      signal:AbortSignal.timeout(timeoutMs),
    });
    const status=response.status;
    if(!response.ok){await response.body?.cancel();return {available:false,status,elapsedMs:Date.now()-started};}
    const body=await response.json();
    return {available:Array.isArray(body.choices)&&typeof body.choices[0]?.message?.content==='string'&&body.choices[0].message.content.includes('OMAA_ROUTE_READY'),status,elapsedMs:Date.now()-started};
  } catch(error) { return {available:false,failure:error.name==='TimeoutError'?'timeout':'transport-or-response',elapsedMs:Date.now()-started}; }
}
