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

test('chartRef resolves to the real tool result when that tool was actually called this turn', async () => {
  const portfolioData = [
    { group: 'Not Started', count: 3, totalContractAmount: 900000, totalBilled: 100000, totalBalance: 800000 },
    { group: 'In Progress', count: 2, totalContractAmount: 500000, totalBilled: 200000, totalBalance: 300000 },
  ];
  const registry = makeRegistry({
    get_portfolio_summary: { data: portfolioData, sources: [], asOf: 'x' },
  });
  let call = 0;
  const client = {
    send: async () => {
      call += 1;
      if (call === 1) return { functionCalls: [{ name: 'get_portfolio_summary', args: {} }] };
      return {
        finalResponse: {
          answer: 'Not Started projects carry the largest balance.',
          citationIds: [],
          followUps: [],
          chartRef: { tool: 'get_portfolio_summary', title: 'Balance by status' },
        },
      };
    },
  };
  const result = await runChat({
    client,
    registry,
    config: { maxToolRounds: 4, maxResultBytes: 60000 },
    messages: [{ role: 'user', text: 'compare balance by status' }],
    pageContext: null,
    requestId: 'r-chart',
  });
  assert.deepEqual(result.chart, {
    type: 'bar',
    title: 'Balance by status',
    tool: 'get_portfolio_summary',
    data: portfolioData,
  });
});

test('chartRef pointing at a tool never called this turn is dropped, not fatal', async () => {
  const registry = makeRegistry({
    get_expense_summary: { data: [{ group: 'Fuel', count: 1, totalAmount: 500 }], sources: [], asOf: 'x' },
  });
  let call = 0;
  const client = {
    send: async () => {
      call += 1;
      if (call === 1) return { functionCalls: [{ name: 'get_expense_summary', args: {} }] };
      return {
        finalResponse: {
          answer: 'Here is the expense breakdown.',
          citationIds: [],
          followUps: [],
          // References a tool that was never called this turn.
          chartRef: { tool: 'get_portfolio_summary', title: 'Balance by status' },
        },
      };
    },
  };
  const result = await runChat({
    client,
    registry,
    config: { maxToolRounds: 4, maxResultBytes: 60000 },
    messages: [{ role: 'user', text: 'expenses?' }],
    pageContext: null,
    requestId: 'r-chart-miss',
  });
  assert.equal(result.chart, null);
  assert.equal(result.answer, 'Here is the expense breakdown.');
});

test('a malformed chartRef is dropped rather than failing the whole turn', async () => {
  const registry = makeRegistry({});
  const client = {
    send: async () => ({
      finalResponse: {
        answer: 'No chart needed here.',
        citationIds: [],
        followUps: [],
        chartRef: { tool: 'delete_everything', title: 'x' },
      },
    }),
  };
  const config = { maxToolRounds: 4, maxResultBytes: 60000 };
  const result = await runChat({ client, registry, config, messages: [{ role: 'user', text: 'q' }], pageContext: null, requestId: 'r-chart-bad' });
  assert.equal(result.chart, null);
  assert.equal(result.answer, 'No chart needed here.');
});
