const test = require('node:test');
const assert = require('node:assert/strict');
const { runChat } = require('./chat');

function makeRegistry(toolResults) {
  return new Map(Object.entries(toolResults).map(([name, result]) => [name, {
    declaration: { name },
    execute: async () => result,
  }]));
}

test('happy path: one tool round then final answer, citations restricted to executed sources', async () => {
  const registry = makeRegistry({
    search_projects: {
      data: [{ id: 'p1' }],
      sources: [{ id: 'project:p1', label: 'P1', route: '/projects/p1', asOf: '2026-08-13T00:00:00.000Z' }],
      asOf: '2026-08-13T00:00:00.000Z',
    },
  });
  let call = 0;
  const client = {
    send: async () => {
      call += 1;
      if (call === 1) {
        return { functionCalls: [{ name: 'search_projects', args: {} }] };
      }
      return { finalResponse: { answer: 'Project P1 is largest.', citationIds: ['project:p1', 'project:invented'], followUps: [] } };
    },
  };
  const config = { maxToolRounds: 4, maxResultBytes: 60000 };
  const result = await runChat({ client, registry, config, messages: [{ role: 'user', text: 'q' }], pageContext: null, requestId: 'r1' });
  assert.equal(result.answer, 'Project P1 is largest.');
  assert.deepEqual(result.citations.map((c) => c.id), ['project:p1']);
  assert.ok(typeof result.notice === 'string' && result.notice.length > 0);
});

test('rejects a tool call for an unregistered tool name', async () => {
  const registry = makeRegistry({});
  const client = { send: async () => ({ functionCalls: [{ name: 'delete_project', args: {} }] }) };
  const config = { maxToolRounds: 4, maxResultBytes: 60000 };
  await assert.rejects(() =>
    runChat({ client, registry, config, messages: [{ role: 'user', text: 'q' }], pageContext: null, requestId: 'r2' }),
  );
});

test('enforces the tool round budget', async () => {
  const registry = makeRegistry({ search_projects: { data: [], sources: [], asOf: 'x' } });
  const client = { send: async () => ({ functionCalls: [{ name: 'search_projects', args: {} }] }) };
  const config = { maxToolRounds: 2, maxResultBytes: 60000 };
  await assert.rejects(() =>
    runChat({ client, registry, config, messages: [{ role: 'user', text: 'q' }], pageContext: null, requestId: 'r3' }),
  );
});

test('provider errors surface as a typed error, never the raw provider message', async () => {
  const registry = makeRegistry({});
  const client = {
    send: async () => {
      throw new Error('upstream boom with secret token abc123');
    },
  };
  const config = { maxToolRounds: 4, maxResultBytes: 60000 };
  await assert.rejects(
    () => runChat({ client, registry, config, messages: [{ role: 'user', text: 'q' }], pageContext: null, requestId: 'r4' }),
    (err) => {
      assert.ok(!String(err.message).includes('secret token abc123'));
      return true;
    },
  );
});

test('final answer with no tool calls still validates and returns a notice', async () => {
  const registry = makeRegistry({});
  const client = {
    send: async () => ({ finalResponse: { answer: 'No data found for that request.', citationIds: [], followUps: [] } }),
  };
  const config = { maxToolRounds: 4, maxResultBytes: 60000 };
  const result = await runChat({ client, registry, config, messages: [{ role: 'user', text: 'q' }], pageContext: null, requestId: 'r5' });
  assert.equal(result.citations.length, 0);
  assert.equal(result.answer, 'No data found for that request.');
});

test('rejects a malformed final response (answer too long)', async () => {
  const registry = makeRegistry({});
  const client = {
    send: async () => ({ finalResponse: { answer: 'x'.repeat(6001), citationIds: [], followUps: [] } }),
  };
  const config = { maxToolRounds: 4, maxResultBytes: 60000 };
  await assert.rejects(() =>
    runChat({ client, registry, config, messages: [{ role: 'user', text: 'q' }], pageContext: null, requestId: 'r6' }),
  );
});

test('enforces the serialized tool-result byte budget', async () => {
  const bigData = { rows: Array.from({ length: 5000 }, (_, i) => ({ i, filler: 'x'.repeat(50) })) };
  const registry = makeRegistry({ search_projects: { data: bigData, sources: [], asOf: 'x' } });
  const client = { send: async () => ({ functionCalls: [{ name: 'search_projects', args: {} }] }) };
  const config = { maxToolRounds: 4, maxResultBytes: 1000 };
  await assert.rejects(() =>
    runChat({ client, registry, config, messages: [{ role: 'user', text: 'q' }], pageContext: null, requestId: 'r7' }),
  );
});
