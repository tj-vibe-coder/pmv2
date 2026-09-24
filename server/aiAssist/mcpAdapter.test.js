'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMcpAdapter, catalogToMcpTools, PROTOCOL_VERSION } = require('./mcpAdapter');

function adapterWith(handler) {
  return createMcpAdapter({
    request: async (path, init) => handler(path, init || {}),
  });
}

test('initialize returns protocol and tools capability without calling HTTP', async () => {
  const mcp = adapterWith(() => { throw new Error('must not be called'); });
  const res = await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(res.result.protocolVersion, PROTOCOL_VERSION);
  assert.deepEqual(res.result.capabilities, { tools: {} });
  assert.equal(res.result.serverInfo.name, 'ioct-assist');
});

test('notifications produce no JSON-RPC response', async () => {
  const mcp = adapterWith(() => { throw new Error('must not be called'); });
  const res = await mcp.handle({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(res, null);
});

test('tools/list maps catalog declarations to MCP inputSchema', async () => {
  const mcp = adapterWith(async (path, init) => {
    assert.equal(path, '/api/ai-assist/operator/catalog');
    assert.equal(init.method, 'GET');
    return {
      status: 200,
      body: {
        ok: true,
        tools: [{
          name: 'search_projects',
          description: 'Search projects',
          parameters: { type: 'object', properties: { search: { type: 'string' } }, required: [] },
        }],
      },
    };
  });
  const res = await mcp.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(res.result.tools, [{
    name: 'search_projects',
    description: 'Search projects',
    inputSchema: { type: 'object', properties: { search: { type: 'string' } }, required: [] },
  }]);
});

test('tools/call posts execute and returns sourced JSON text', async () => {
  const mcp = adapterWith(async (path, init) => {
    assert.equal(path, '/api/ai-assist/operator/execute');
    assert.equal(init.method, 'POST');
    assert.deepEqual(init.body, { name: 'search_projects', args: { search: 'rezcoat' } });
    return {
      status: 200,
      body: { ok: true, name: 'search_projects', result: [], sources: [] },
    };
  });
  const res = await mcp.handle({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'search_projects', arguments: { search: 'rezcoat' } },
  });
  assert.equal(res.result.isError, undefined);
  assert.equal(res.result.content[0].type, 'text');
  assert.deepEqual(JSON.parse(res.result.content[0].text), {
    name: 'search_projects',
    result: [],
    sources: [],
  });
});

test('tools/call unknown tool is a tool error, not a protocol crash', async () => {
  const mcp = adapterWith(async () => ({ status: 404, body: { ok: false, error: 'unknown_tool' } }));
  const res = await mcp.handle({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'delete_project', arguments: {} },
  });
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /Unknown Assist tool/);
});

test('401 and 403 from operator stay generic', async () => {
  const unauth = adapterWith(async () => ({ status: 401, body: { ok: false } }));
  const forbidden = adapterWith(async () => ({ status: 403, body: { ok: false } }));
  const a = await unauth.handle({ jsonrpc: '2.0', id: 5, method: 'tools/list' });
  const b = await forbidden.handle({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'search_projects' } });
  assert.match(a.error.message, /Sign in/);
  assert.match(b.result.content[0].text, /not available/);
});

test('catalogToMcpTools drops nameless entries', () => {
  assert.deepEqual(catalogToMcpTools([{ name: '', description: 'x' }, { name: 'ok', parameters: { type: 'object' } }]), [
    { name: 'ok', description: '', inputSchema: { type: 'object' } },
  ]);
});
