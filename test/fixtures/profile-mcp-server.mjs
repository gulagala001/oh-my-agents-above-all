// Synthetic stdio peer; the real native MCP client owns transport/lifecycle.
import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
const [audit, server] = process.argv.slice(2);
const log = value => appendFileSync(audit, JSON.stringify({ server, pid: process.pid, ...value }) + '\n');
log({ kind: 'start' });
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (request.id === undefined) continue;
  let result;
  if (request.method === 'initialize') result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: server, version: '1' }, instructions: 'SERVER_INSTRUCTION_' + server };
  else if (request.method === 'tools/list') result = { tools: ['read_note', 'private_note'].map(name => ({ name, description: 'Synthetic ' + name,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } })) };
  else if (request.method === 'tools/call') {
    log({ kind: 'call', tool: request.params.name });
    result = { content: [{ type: 'text', text: 'MCP_RESULT_' + server + '_' + request.params.name }] };
  } else if (request.method === 'ping') result = {};
  else { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Unknown fixture method' } }) + '\n'); continue; }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
}
log({ kind: 'end' });
