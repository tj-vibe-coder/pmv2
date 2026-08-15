const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { createAiAssistRouter } = require('./router');
const { createProposalStore, proposeOpportunityUpdate } = require('./proposals');

function startServer(opts) {
  const app = express();
  app.use(express.json());
  app.use('/api/ai-assist', createAiAssistRouter(opts));
  const server = app.listen(0);
  return new Promise((resolve) => {
    server.on('listening', () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}/api/ai-assist` });
    });
  });
}

function baseConfig(overrides) {
  return Object.assign(
    {
      enabled: true,
      allowedUsers: ['RJR', 'TJC'],
      promptVersion: 'ioct-readonly-v1',
      chatProvider: 'gemini',
      chatModel: 'gemini-3.5-flash-lite',
      liveModel: 'gemini-2.5-flash-native-audio-preview-12-2025',
      maxToolRounds: 4,
      maxResultBytes: 60000,
      liveSessionSeconds: 600,
    },
    overrides,
  );
}

function fakeLiveClient() {
  return { authTokens: { create: async () => ({ name: 'fake-live-token' }) } };
}

function auditSpy() {
  const calls = [];
  return { calls, recordAudit: async (record) => { calls.push(record); } };
}

const emptyDb = { collection: () => ({ get: async () => ({ docs: [] }) }) };

test('unauthenticated request returns 401 before any Gemini/Firestore work', async () => {
  const { server, base } = await startServer({
    db: emptyDb,
    getCurrentUser: async () => null,
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
  });
  try {
    const res = await fetch(base + '/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', text: 'hi' }] }),
    });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('non-allowlisted authenticated user returns 403', async () => {
  const { server, base } = await startServer({
    db: emptyDb,
    getCurrentUser: async () => ({ id: 'u1', username: 'viewer' }),
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
  });
  try {
    const res = await fetch(base + '/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', text: 'hi' }] }),
    });
    assert.equal(res.status, 403);
  } finally {
    server.close();
  }
});

test('disabled feature returns 503', async () => {
  const { server, base } = await startServer({
    db: emptyDb,
    getCurrentUser: async () => ({ id: 'u1', username: 'RJR' }),
    config: baseConfig({ enabled: false }),
    createChatClient: () => { throw new Error('must not be called'); },
  });
  try {
    const res = await fetch(base + '/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', text: 'hi' }] }),
    });
    assert.equal(res.status, 503);
  } finally {
    server.close();
  }
});

test('invalid request body returns 400', async () => {
  const { server, base } = await startServer({
    db: emptyDb,
    getCurrentUser: async () => ({ id: 'u1', username: 'RJR' }),
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
  });
  try {
    const res = await fetch(base + '/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('a synchronous throw in createChatClient still returns a sanitized 502, not a hang or a leaked stack', async () => {
  const { server, base } = await startServer({
    db: emptyDb,
    getCurrentUser: async () => ({ id: 'u1', username: 'RJR' }),
    config: baseConfig(),
    createChatClient: () => { throw new Error('sdk-init-secret-boom'); },
  });
  try {
    const res = await fetch(base + '/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', text: 'hi' }] }),
    });
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.ok(!JSON.stringify(body).includes('sdk-init-secret-boom'));
  } finally {
    server.close();
  }
});

test('getCurrentUser rejecting returns 503, not a hang or a leaked stack', async () => {
  const { server, base } = await startServer({
    db: emptyDb,
    getCurrentUser: async () => { throw new Error('token-store-secret-boom'); },
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
  });
  try {
    const res = await fetch(base + '/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', text: 'hi' }] }),
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.ok(!JSON.stringify(body).includes('token-store-secret-boom'));
  } finally {
    server.close();
  }
});

test('provider failure returns 502 and a generic message, never the raw provider error', async () => {
  const { server, base } = await startServer({
    db: emptyDb,
    getCurrentUser: async () => ({ id: 'u1', username: 'RJR' }),
    config: baseConfig(),
    createChatClient: () => ({
      send: async () => { throw new Error('upstream leaked-secret-xyz'); },
    }),
  });
  try {
    const res = await fetch(base + '/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', text: 'hi' }] }),
    });
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.ok(!JSON.stringify(body).includes('leaked-secret-xyz'));
  } finally {
    server.close();
  }
});

test('successful chat returns 200 with the documented envelope and writes a metadata-only audit record', async () => {
  const { calls, recordAudit } = auditSpy();
  const { server, base } = await startServer({
    db: emptyDb,
    getCurrentUser: async () => ({ id: 'u1', username: 'RJR' }),
    config: baseConfig(),
    createChatClient: () => ({
      send: async () => ({ finalResponse: { answer: 'Hello answer.', citationIds: [], followUps: [] } }),
    }),
    recordAudit,
  });
  try {
    const res = await fetch(base + '/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', text: 'super secret prompt text' }] }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.answer, 'Hello answer.');
    assert.ok(typeof body.requestId === 'string' && body.requestId.length > 0);
    assert.ok(typeof body.notice === 'string' && body.notice.length > 0);
    assert.equal(body.proposal, null);

    assert.equal(calls.length, 1);
    const record = JSON.stringify(calls[0]);
    assert.ok(!record.includes('super secret prompt text'));
    assert.ok(!record.includes('Hello answer.'));
    assert.equal(calls[0].userId, 'u1');
    assert.equal(calls[0].outcome, 'success');
  } finally {
    server.close();
  }
});

test('rate limit returns 429 once the per-user/IP budget is exceeded', async () => {
  const { server, base } = await startServer({
    db: emptyDb,
    getCurrentUser: async () => ({ id: 'u1', username: 'RJR' }),
    config: baseConfig(),
    createChatClient: () => ({
      send: async () => ({ finalResponse: { answer: 'ok', citationIds: [], followUps: [] } }),
    }),
    rateLimit: { windowMs: 60000, maxRequests: 1 },
  });
  try {
    const send = () =>
      fetch(base + '/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', text: 'hi' }] }),
      });
    const first = await send();
    assert.equal(first.status, 200);
    const second = await send();
    assert.equal(second.status, 429);
  } finally {
    server.close();
  }
});

test('GET /health requires authorization and never exposes key material', async () => {
  const { server, base } = await startServer({
    db: emptyDb,
    getCurrentUser: async () => ({ id: 'u1', username: 'RJR' }),
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
  });
  try {
    const res = await fetch(base + '/health');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.enabled, true);
    assert.equal(body.chatProvider, 'gemini');
    assert.equal(body.chatModel, 'gemini-3.5-flash-lite');
    const text = JSON.stringify(body).toLowerCase();
    assert.ok(!text.includes('apikey') && !text.includes('api_key') && !text.includes('gemini_api_key'));
  } finally {
    server.close();
  }
});

test('POST /live-token requires authorization and returns a session-bound token, never the API key', async () => {
  const { server, base } = await startServer({
    db: emptyDb,
    getCurrentUser: async () => null,
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
    createLiveClient: fakeLiveClient,
    geminiApiKey: 'super-secret-key',
  });
  try {
    const unauth = await fetch(base + '/live-token', { method: 'POST' });
    assert.equal(unauth.status, 401);
  } finally {
    server.close();
  }
});

test('POST /live-token succeeds for an allowlisted user and returns a liveSessionId', async () => {
  const { server, base } = await startServer({
    db: emptyDb,
    getCurrentUser: async () => ({ id: 'u1', username: 'RJR' }),
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
    createLiveClient: fakeLiveClient,
    geminiApiKey: 'super-secret-key',
  });
  try {
    const res = await fetch(base + '/live-token', { method: 'POST' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.token, 'fake-live-token');
    assert.equal(typeof body.liveSessionId, 'string');
    assert.ok(body.liveSessionId.length > 0);
    const text = JSON.stringify(body).toLowerCase();
    assert.ok(!text.includes('super-secret-key'));
  } finally {
    server.close();
  }
});

test('POST /live-token rate-limits after the configured budget', async () => {
  const { server, base } = await startServer({
    db: emptyDb,
    getCurrentUser: async () => ({ id: 'u1', username: 'RJR' }),
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
    createLiveClient: fakeLiveClient,
    geminiApiKey: 'k',
    liveRateLimit: { windowMs: 60000, maxRequests: 1 },
  });
  try {
    const first = await fetch(base + '/live-token', { method: 'POST' });
    assert.equal(first.status, 200);
    const second = await fetch(base + '/live-token', { method: 'POST' });
    assert.equal(second.status, 429);
  } finally {
    server.close();
  }
});

test('POST /tools/:name requires a valid liveSessionId bound to the requesting user', async () => {
  const { server, base } = await startServer({
    db: emptyDb,
    getCurrentUser: async () => ({ id: 'u1', username: 'RJR' }),
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
    createLiveClient: fakeLiveClient,
    geminiApiKey: 'k',
  });
  try {
    const missing = await fetch(base + '/tools/search_projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ liveSessionId: 'does-not-exist', args: {} }),
    });
    assert.equal(missing.status, 401);
  } finally {
    server.close();
  }
});

test('POST /tools/:name executes an allowlisted tool through a valid live session and returns sourced data', async () => {
  const projectDocs = [{
    id: 'p1',
    data: () => ({ project_name: 'Plant Upgrade', project_status: 'sent', updated_at: '2026-08-13T00:00:00.000Z' }),
  }];
  const projectsDb = { collection: () => ({ get: async () => ({ docs: projectDocs }) }) };
  const { server, base } = await startServer({
    db: projectsDb,
    getCurrentUser: async () => ({ id: 'u1', username: 'RJR' }),
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
    createLiveClient: fakeLiveClient,
    geminiApiKey: 'k',
  });
  try {
    const tokenRes = await fetch(base + '/live-token', { method: 'POST' });
    const { liveSessionId } = await tokenRes.json();

    const toolRes = await fetch(base + '/tools/search_projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ liveSessionId, args: { status: 'sent' } }),
    });
    assert.equal(toolRes.status, 200);
    const body = await toolRes.json();
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.result));
    assert.ok(Array.isArray(body.sources));
    assert.equal(body.result[0].project_name, 'Plant Upgrade');
  } finally {
    server.close();
  }
});

test('POST /tools/:name rejects an unknown tool name (fails closed)', async () => {
  const { server, base } = await startServer({
    db: emptyDb,
    getCurrentUser: async () => ({ id: 'u1', username: 'RJR' }),
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
    createLiveClient: fakeLiveClient,
    geminiApiKey: 'k',
  });
  try {
    const tokenRes = await fetch(base + '/live-token', { method: 'POST' });
    const { liveSessionId } = await tokenRes.json();

    const toolRes = await fetch(base + '/tools/delete_project', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ liveSessionId, args: {} }),
    });
    assert.equal(toolRes.status, 400);
  } finally {
    server.close();
  }
});

test('POST /tools/:name enforces the per-session tool-call budget', async () => {
  const projectsDb = { collection: () => ({ get: async () => ({ docs: [] }) }) };
  const { server, base } = await startServer({
    db: projectsDb,
    getCurrentUser: async () => ({ id: 'u1', username: 'RJR' }),
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
    createLiveClient: fakeLiveClient,
    geminiApiKey: 'k',
  });
  try {
    const tokenRes = await fetch(base + '/live-token', { method: 'POST' });
    const { liveSessionId } = await tokenRes.json();

    let lastStatus = 0;
    for (let i = 0; i < 9; i += 1) {
      const toolRes = await fetch(base + '/tools/search_projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ liveSessionId, args: {} }),
      });
      lastStatus = toolRes.status;
    }
    assert.equal(lastStatus, 429);
  } finally {
    server.close();
  }
});

test('a live session issued for one user cannot be used by a different authenticated user', async () => {
  let currentUser = { id: 'u1', username: 'RJR' };
  const { server, base } = await startServer({
    db: emptyDb,
    getCurrentUser: async () => currentUser,
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
    createLiveClient: fakeLiveClient,
    geminiApiKey: 'k',
  });
  try {
    const tokenRes = await fetch(base + '/live-token', { method: 'POST' });
    const { liveSessionId } = await tokenRes.json();

    currentUser = { id: 'u2', username: 'TJC' };
    const toolRes = await fetch(base + '/tools/search_projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ liveSessionId, args: {} }),
    });
    assert.equal(toolRes.status, 403);
  } finally {
    server.close();
  }
});

test('POST /proposals/:id/confirm returns 401 without user', async () => {
  const { server, base } = await startServer({
    db: emptyDb,
    getCurrentUser: async () => null,
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
  });
  try {
    const res = await fetch(base + '/proposals/p1/confirm', { method: 'POST' });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('POST /proposals/:id/confirm returns 403 when proposal owned by another user', async () => {
  const proposalStore = createProposalStore();
  const proposalUser = { id: 'u-owner', username: 'RJR' };
  const requestingUser = { id: 'u-other', username: 'TJC' };
  let current = { id: 'opp1', name: 'Rezcoat', status: 'draft' };
  const fakeDb = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ id: 'opp1', exists: true, data: () => ({ ...current }) }),
        update: async (patch) => { current = { ...current, ...patch }; },
      }),
    }),
  };
  const proposal = await proposeOpportunityUpdate({
    db: fakeDb,
    store: proposalStore,
    user: proposalUser,
    args: { opportunityId: 'opp1', field: 'status', value: 'for_review' },
    asOf: '2026-08-15T00:00:00.000Z',
  });

  const { server, base } = await startServer({
    db: fakeDb,
    proposalStore,
    getCurrentUser: async () => requestingUser,
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
  });
  try {
    const res = await fetch(base + `/proposals/${proposal.data.proposalId}/confirm`, { method: 'POST' });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, 'not_allowlisted');
  } finally {
    server.close();
  }
});

test('POST /proposals/:id/confirm 200 applies update and returns applied:true', async () => {
  const proposalStore = createProposalStore();
  const user = { id: 'u1', username: 'RJR' };
  const updates = [];
  let current = { id: 'opp1', name: 'Rezcoat', opportunityGrade: 'B' };
  const fakeDb = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ id: 'opp1', exists: true, data: () => ({ ...current }) }),
        update: async (patch) => {
          updates.push(patch);
          current = { ...current, ...patch };
        },
      }),
    }),
  };
  const proposal = await proposeOpportunityUpdate({
    db: fakeDb,
    store: proposalStore,
    user,
    args: { opportunityId: 'opp1', field: 'opportunityGrade', value: 'A' },
    asOf: '2026-08-15T00:00:00.000Z',
  });

  const { server, base } = await startServer({
    db: fakeDb,
    proposalStore,
    getCurrentUser: async () => user,
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
  });
  try {
    const res = await fetch(base + `/proposals/${proposal.data.proposalId}/confirm`, { method: 'POST' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.applied, true);
    assert.equal(body.field, 'opportunityGrade');
    assert.equal(body.proposedValue, 'A');
    assert.equal(updates.length, 1);
    assert.equal(updates[0].opportunityGrade, 'A');
    assert.ok(updates[0].updatedAt);
  } finally {
    server.close();
  }
});

test('POST /proposals/:id/reject 200 then confirm 404', async () => {
  const proposalStore = createProposalStore();
  const user = { id: 'u1', username: 'RJR' };
  const updates = [];
  let current = { id: 'opp1', name: 'Rezcoat', notes: 'old' };
  const fakeDb = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ id: 'opp1', exists: true, data: () => ({ ...current }) }),
        update: async (patch) => { updates.push(patch); },
      }),
    }),
  };
  const proposal = await proposeOpportunityUpdate({
    db: fakeDb,
    store: proposalStore,
    user,
    args: { opportunityId: 'opp1', field: 'notes', value: 'new' },
    asOf: '2026-08-15T00:00:00.000Z',
  });

  const { server, base } = await startServer({
    db: fakeDb,
    proposalStore,
    getCurrentUser: async () => user,
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
  });
  try {
    const rejectRes = await fetch(base + `/proposals/${proposal.data.proposalId}/reject`, { method: 'POST' });
    assert.equal(rejectRes.status, 200);
    const rejectBody = await rejectRes.json();
    assert.equal(rejectBody.ok, true);
    assert.equal(rejectBody.rejected, true);
    assert.equal(updates.length, 0);

    const confirmRes = await fetch(base + `/proposals/${proposal.data.proposalId}/confirm`, { method: 'POST' });
    assert.equal(confirmRes.status, 404);
  } finally {
    server.close();
  }
});

test('GET /operator/catalog requires auth and returns declarations only', async () => {
  const { server, base } = await startServer({
    db: emptyDb,
    getCurrentUser: async () => ({ id: 'u1', username: 'RJR' }),
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
  });
  try {
    const res = await fetch(base + '/operator/catalog');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.tools));
    assert.ok(body.tools.some((tool) => tool.name === 'search_projects'));
    assert.ok(body.tools.every((tool) => !('execute' in tool)));
  } finally {
    server.close();
  }
});

test('GET /operator/catalog returns 401 without user', async () => {
  const { server, base } = await startServer({
    db: emptyDb,
    getCurrentUser: async () => null,
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
  });
  try {
    const res = await fetch(base + '/operator/catalog');
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('POST /operator/execute 403 for a non-allowlisted user', async () => {
  const { server, base } = await startServer({
    db: emptyDb,
    getCurrentUser: async () => ({ id: 'u9', username: 'admin' }),
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
  });
  try {
    const res = await fetch(base + '/operator/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'search_projects', args: {} }),
    });
    assert.equal(res.status, 403);
  } finally {
    server.close();
  }
});

test('POST /operator/execute 404s unknown tools and 400s extra keys', async () => {
  const { server, base } = await startServer({
    db: emptyDb,
    getCurrentUser: async () => ({ id: 'u1', username: 'RJR' }),
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
  });
  try {
    const unknown = await fetch(base + '/operator/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'delete_project', args: {} }),
    });
    assert.equal(unknown.status, 404);
    const extra = await fetch(base + '/operator/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'search_projects', args: {}, route: '/settings' }),
    });
    assert.equal(extra.status, 400);
  } finally {
    server.close();
  }
});

test('POST /operator/execute runs an allowlisted tool without a live session', async () => {
  const fakeDb = {
    collection: (name) => {
      assert.equal(name, 'projects');
      return { get: async () => ({ docs: [] }) };
    },
  };
  const { server, base } = await startServer({
    db: fakeDb,
    getCurrentUser: async () => ({ id: 'u1', username: 'RJR' }),
    config: baseConfig(),
    createChatClient: () => { throw new Error('must not be called'); },
  });
  try {
    const res = await fetch(base + '/operator/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'search_projects', args: { search: 'none' } }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.name, 'search_projects');
    assert.deepEqual(body.result, []);
    assert.deepEqual(body.sources, []);
  } finally {
    server.close();
  }
});
