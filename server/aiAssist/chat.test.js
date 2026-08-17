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
  assert.equal(result.navigateTo, null);
  assert.equal(result.proposal, null);
});

test('surfaces a unique navigate_to_record match as navigateTo', async () => {
  const registry = makeRegistry({
    navigate_to_record: {
      data: { action: 'navigate', route: '/sales/calcsheet/projects/opp1', label: 'Rezcoat' },
      sources: [{ id: 'opp1', label: 'Rezcoat', route: '/sales/calcsheet/projects/opp1', asOf: 'x' }],
    },
  });
  let call = 0;
  const client = {
    send: async () => {
      call += 1;
      if (call === 1) return { functionCalls: [{ name: 'navigate_to_record', args: { search: 'rezcoat' } }] };
      return { finalResponse: { answer: 'Opening Rezcoat.', citationIds: ['opp1'], followUps: [] } };
    },
  };
  const result = await runChat({
    client,
    registry,
    config: { maxToolRounds: 4, maxResultBytes: 60000 },
    messages: [{ role: 'user', text: 'go to rezcoat' }],
    pageContext: null,
    requestId: 'r-nav',
  });
  assert.deepEqual(result.navigateTo, { route: '/sales/calcsheet/projects/opp1', label: 'Rezcoat' });
});

test('rejects a tool call for an unregistered tool name', async () => {
  const registry = makeRegistry({});
  const client = { send: async () => ({ functionCalls: [{ name: 'delete_project', args: {} }] }) };
  const config = { maxToolRounds: 4, maxResultBytes: 60000 };
  await assert.rejects(() =>
    runChat({ client, registry, config, messages: [{ role: 'user', text: 'q' }], pageContext: null, requestId: 'r2' }),
  );
});

test('invalid tool arguments from the model are fed back as a recoverable result, not a fatal error', async () => {
  const registry = makeRegistry({
    search_projects: {
      data: [{ id: 'p1' }],
      sources: [{ id: 'project:p1', label: 'P1', route: '/projects/p1', asOf: 'x' }],
      asOf: 'x',
    },
  });
  let call = 0;
  const seenMessages = [];
  const client = {
    send: async (state) => {
      call += 1;
      seenMessages.push(state.toolResults);
      if (call === 1) {
        // The model invents a status value outside the real enum — this is
        // exactly what happened in production against live Gemini traffic.
        return { functionCalls: [{ name: 'search_projects', args: { status: 'open' } }] };
      }
      return { finalResponse: { answer: 'Retried with valid arguments.', citationIds: [], followUps: [] } };
    },
  };
  const config = { maxToolRounds: 4, maxResultBytes: 60000 };
  const result = await runChat({ client, registry, config, messages: [{ role: 'user', text: 'q' }], pageContext: null, requestId: 'r-invalid-args' });
  assert.equal(result.answer, 'Retried with valid arguments.');
  // The chat loop did not throw; the model instead got a tool result
  // describing the invalid_arguments error, visible on the second send().
  assert.equal(seenMessages[1][0].name, 'search_projects');
  assert.equal(seenMessages[1][0].data.error, 'invalid_arguments');
  assert.match(seenMessages[1][0].data.message, /status/);
});

test('a genuine tool.execute() failure (e.g. Firestore) still fails the whole turn, unlike an argument-validation error', async () => {
  const registry = new Map([['search_projects', {
    declaration: { name: 'search_projects' },
    execute: async () => { throw new Error('Firestore unavailable'); },
  }]]);
  const client = { send: async () => ({ functionCalls: [{ name: 'search_projects', args: {} }] }) };
  const config = { maxToolRounds: 4, maxResultBytes: 60000 };
  await assert.rejects(() =>
    runChat({ client, registry, config, messages: [{ role: 'user', text: 'q' }], pageContext: null, requestId: 'r-infra-fail' }),
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

test('surfaces propose_opportunity_update proposal on chat result', async () => {
  const registry = makeRegistry({
    propose_opportunity_update: {
      data: {
        proposalId: 'prop-123',
        kind: 'opportunity',
        recordId: 'opp1',
        label: 'Rezcoat',
        field: 'opportunityGrade',
        currentValue: 'B',
        proposedValue: 'A',
        reason: 'stronger margin',
        expiresAt: '2026-08-15T01:00:00.000Z',
      },
      sources: [{ id: 'opp1', label: 'Rezcoat', route: '/sales/calcsheet/projects/opp1', asOf: 'x' }],
    },
  });
  let call = 0;
  const client = {
    send: async () => {
      call += 1;
      if (call === 1) {
        return {
          functionCalls: [{
            name: 'propose_opportunity_update',
            args: { opportunityId: 'opp1', field: 'opportunityGrade', value: 'A', reason: 'stronger margin' },
          }],
        };
      }
      return {
        finalResponse: {
          answer: 'I proposed updating opportunity grade to A. Please confirm.',
          citationIds: ['opp1'],
          followUps: ['Apply that change'],
        },
      };
    },
  };
  const result = await runChat({
    client,
    registry,
    config: { maxToolRounds: 4, maxResultBytes: 60000 },
    messages: [{ role: 'user', text: 'change grade to A' }],
    pageContext: null,
    requestId: 'r-prop',
  });
  assert.equal(result.proposal.proposalId, 'prop-123');
  assert.equal(result.proposal.recordId, 'opp1');
  assert.equal(result.proposal.field, 'opportunityGrade');
  assert.equal(result.proposal.proposedValue, 'A');
});
