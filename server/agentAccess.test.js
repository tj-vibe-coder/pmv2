'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const agentAccess = require('./agentAccess');
const { createApiAccessGate } = require('./apiAccess');
const { createProjectUpdatesRouter } = require('./projectUpdates');

// Minimal in-memory Firestore: collections, docs, one level of subcollections.
function fakeDb(seed = {}) {
  const store = new Map(); // path -> data
  let auto = 0;
  for (const [path, data] of Object.entries(seed)) store.set(path, { ...data });
  const docRef = (path) => {
    const id = path.split('/').pop();
    return {
      id,
      path,
      async get() {
        const data = store.get(path);
        return { id, exists: !!data, ref: docRef(path), data: () => (data ? { ...data } : undefined) };
      },
      async set(data) { store.set(path, { ...data }); },
      async delete() { store.delete(path); },
      async update(patch) {
        if (!store.has(path)) throw new Error('NOT_FOUND');
        store.set(path, { ...store.get(path), ...patch });
      },
      collection: (name) => collRef(`${path}/${name}`),
    };
  };
  const collRef = (path) => ({
    doc: (id) => docRef(`${path}/${id}`),
    async add(data) {
      auto += 1;
      const ref = docRef(`${path}/auto${auto}`);
      await ref.set(data);
      return ref;
    },
    async get() {
      const depth = path.split('/').length + 1;
      const docs = [...store.keys()]
        .filter((p) => p.startsWith(path + '/') && p.split('/').length === depth)
        .map((p) => ({ id: p.split('/').pop(), ref: docRef(p), data: () => ({ ...store.get(p) }) }));
      return { docs };
    },
  });
  return { collection: (name) => collRef(name), store };
}

function seededDb() {
  const { key, hash } = agentAccess.mintAgentKey();
  const revoked = agentAccess.mintAgentKey();
  const db = fakeDb({
    [`agent_keys/${hash}`]: { name: 'Projects Agent', createdAt: '2026-11-01T00:00:00Z', revokedAt: null, lastUsedAt: null },
    [`agent_keys/${revoked.hash}`]: { name: 'Old', createdAt: '2026-10-01T00:00:00Z', revokedAt: '2026-10-02T00:00:00Z' },
    'projects/p1': { ovp_number: 'IOCT2610005', project_name: 'MDLZ Diverter System', project_status: 'NOT STARTED', actual_site_progress_percent: 0, updated_contract_amount: 5490000, contract_billed: 0, calcsheet_project_id: 'c1' },
    'projects/p2': { ovp_number: 'IOCT2512001', project_name: 'Tann SCADA', project_status: 'COMPLETED', actual_site_progress_percent: 100, updated_contract_amount: 161300, contract_billed: 161300 },
  });
  return { db, key, revokedKey: revoked.key };
}

async function withApp(db, users, fn) {
  const synced = [];
  const getCurrentUser = async (req) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (agentAccess.isAgentKey(token)) return agentAccess.lookupAgentKey(db, token);
    return users[token] || null;
  };
  const isActiveUser = (u) => !!u && (u.role === 'superadmin' || u.approved === 1);
  const app = express();
  app.use(express.json());
  app.use(createApiAccessGate({ getCurrentUser, isActiveUser }));
  app.use(agentAccess.createAgentRouter({ db, getCurrentUser, isActiveUser }));
  app.use(createProjectUpdatesRouter({
    db, getCurrentUser, isActiveUser,
    syncOperationsStatusToCalcsheet: async (id, data) => { synced.push([id, data.project_status]); },
  }));
  app.get('/api/projects', (_req, res) => res.json({ reached: true }));
  app.delete('/api/projects', (_req, res) => res.json({ reached: true }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, token, body) => {
    const r = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  try {
    await fn(call, synced);
  } finally {
    server.close();
  }
}

test('minted keys have the agk_ shape and only the hash identifies them', () => {
  const { key, hash } = agentAccess.mintAgentKey();
  assert.ok(agentAccess.isAgentKey(key));
  assert.equal(hash, agentAccess.hashAgentKey(key));
  assert.notEqual(hash, key);
  assert.equal(agentAccess.isAgentKey('agk_short'), false);
  assert.equal(agentAccess.isAgentKey('scan_abc'), false);
});

test('lookupAgentKey resolves active keys only', async () => {
  const { db, key, revokedKey } = seededDb();
  const user = await agentAccess.lookupAgentKey(db, key);
  assert.equal(user.agentScope, true);
  assert.equal(user.role, 'agent');
  assert.equal(user.name, 'Projects Agent');
  assert.equal(await agentAccess.lookupAgentKey(db, revokedKey), null);
  assert.equal(await agentAccess.lookupAgentKey(db, agentAccess.mintAgentKey().key), null);
});

test('an agent key reaches only the agent routes', async () => {
  const { db, key } = seededDb();
  await withApp(db, {}, async (call) => {
    assert.equal((await call('GET', '/api/agent/projects', key)).status, 200);
    assert.equal((await call('GET', '/api/projects/p1/updates', key)).status, 200);
    assert.equal((await call('GET', '/api/projects', key)).status, 403);
    assert.equal((await call('DELETE', '/api/projects/p1/updates/x', key)).status, 403);
    assert.equal((await call('DELETE', '/api/projects', key, { ids: ['p1'] })).status, 403);
    assert.equal((await call('POST', '/api/agent-keys', key, { name: 'x' })).status, 403);
    assert.equal((await call('GET', '/api/agent/projects')).status, 401);
  });
});

test('a revoked key is rejected', async () => {
  const { db, revokedKey } = seededDb();
  await withApp(db, {}, async (call) => {
    assert.equal((await call('GET', '/api/agent/projects', revokedKey)).status, 401);
  });
});

test('agents list projects in the compact view, optionally active only', async () => {
  const { db, key } = seededDb();
  await withApp(db, {}, async (call) => {
    const all = await call('GET', '/api/agent/projects', key);
    assert.equal(all.body.projects.length, 2);
    assert.equal(all.body.projects[0].calcsheet_project_id, undefined);
    const active = await call('GET', '/api/agent/projects?active=1', key);
    assert.deepEqual(active.body.projects.map((p) => p.id), ['p1']);
  });
});

test('an agent posts to the shared updates log; only status and progress change', async () => {
  const { db, key } = seededDb();
  await withApp(db, {}, async (call, synced) => {
    const res = await call('POST', '/api/projects/p1/updates', key, {
      note: 'Mobilized, panel fabrication started', type: 'site work', status: 'IN PROGRESS', progress: 15, contract_billed: 1,
    });
    assert.equal(res.status, 201);
    const project = db.store.get('projects/p1');
    assert.equal(project.project_status, 'IN PROGRESS');
    assert.equal(project.actual_site_progress_percent, 15);
    assert.equal(project.contract_billed, 0);
    assert.equal(project.latest_update.by, 'Projects Agent');
    assert.equal(project.latest_update.via, 'agent');
    assert.deepEqual(synced, [['p1', 'IN PROGRESS']]);
    const list = await call('GET', '/api/agent/projects', key);
    assert.equal(list.body.projects.find((p) => p.id === 'p1').latest_update.type, 'Site work');
    assert.equal((await call('POST', '/api/projects/p1/updates', key, { status: 'CLOSED', note: 'x' })).status, 400);
  });
});

test('only a superadmin login session can mint, list and revoke keys', async () => {
  const { db } = seededDb();
  const users = {
    boss: { id: 'u1', username: 'TJC', role: 'superadmin', approved: 1 },
    staff: { id: 'u2', username: 'RPP', role: 'user', approved: 1 },
  };
  await withApp(db, users, async (call) => {
    assert.equal((await call('POST', '/api/agent-keys', 'staff', { name: 'x' })).status, 403);
    const minted = await call('POST', '/api/agent-keys', 'boss', { name: 'Morning agents' });
    assert.equal(minted.status, 201);
    assert.ok(agentAccess.isAgentKey(minted.body.key));
    assert.equal((await call('GET', '/api/agent/projects', minted.body.key)).status, 200);
    const list = await call('GET', '/api/agent-keys', 'boss');
    assert.ok(list.body.keys.some((k) => k.name === 'Morning agents'));
    assert.ok(list.body.keys.every((k) => k.key === undefined));
    assert.equal((await call('DELETE', `/api/agent-keys/${minted.body.id}`, 'boss')).status, 200);
    assert.equal((await call('GET', '/api/agent/projects', minted.body.key)).status, 401);
  });
});
