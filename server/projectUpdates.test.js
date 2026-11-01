'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { parseProjectUpdate, createProjectUpdatesRouter } = require('./projectUpdates');

function fakeDb(seed = {}) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, { ...v }]));
  let auto = 0;
  const docRef = (path) => ({
    id: path.split('/').pop(),
    async get() {
      const data = store.get(path);
      return { id: path.split('/').pop(), exists: !!data, data: () => (data ? { ...data } : undefined) };
    },
    async set(data) { store.set(path, { ...data }); },
    async update(patch) { store.set(path, { ...store.get(path), ...patch }); },
    async delete() { store.delete(path); },
    collection: (name) => collRef(`${path}/${name}`),
  });
  const collRef = (path) => ({
    doc: (id) => docRef(`${path}/${id}`),
    async add(data) { auto += 1; const ref = docRef(`${path}/u${auto}`); await ref.set(data); return ref; },
    async get() {
      const depth = path.split('/').length + 1;
      return { docs: [...store.keys()].filter((p) => p.startsWith(path + '/') && p.split('/').length === depth)
        .map((p) => ({ id: p.split('/').pop(), data: () => ({ ...store.get(p) }) })) };
    },
  });
  return { collection: (n) => collRef(n), store };
}

const USERS = {
  tj: { id: 'u1', username: 'TJC', role: 'superadmin', approved: 1 },
  renzel: { id: 'u2', username: 'RPP', role: 'user', approved: 1 },
  kim: { id: 'u3', username: 'KKS', role: 'user', approved: 1 },
  viewer: { id: 'u4', username: 'guest', role: 'viewer', approved: 1 },
  phone: { id: 'u2', username: 'RPP', role: 'user', approved: 1, scannerScope: true },
};

async function withApp(db, fn) {
  const app = express();
  app.use(express.json());
  app.use(createProjectUpdatesRouter({
    db,
    getCurrentUser: async (req) => USERS[String(req.headers.authorization || '').replace(/^Bearer /, '')] || null,
    isActiveUser: (u) => u.role === 'superadmin' || u.approved === 1,
  }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, who, body) => {
    const r = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${who}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  try { await fn(call); } finally { server.close(); }
}

const seed = () => fakeDb({ 'projects/sual': { project_name: 'Sual Rewiring', project_status: 'IN PROGRESS', actual_site_progress_percent: 40 } });

test('parseProjectUpdate validates every field', () => {
  assert.match(parseProjectUpdate({}).error, /note/);
  assert.match(parseProjectUpdate({ note: 'x', type: 'gossip' }).error, /type/);
  assert.match(parseProjectUpdate({ note: 'x', status: 'TERMINATED' }).error, /status/);
  assert.match(parseProjectUpdate({ note: 'x', progress: -1 }).error, /progress/);
  assert.match(parseProjectUpdate({ note: 'x', next_date: 'tomorrow' }).error, /next_date/);
  assert.match(parseProjectUpdate({ note: 'x', link: 'javascript:alert(1)' }).error, /https/);
  const ok = parseProjectUpdate({ note: ' Sent drawings ', type: 'submittal', date: '2026-10-31', next_step: 'Await ISTS comments', next_date: '2026-11-07' });
  assert.equal(ok.update.type, 'Submittal');
  assert.equal(ok.update.note, 'Sent drawings');
  assert.deepEqual(ok.projectPatch, {});
});

test('any staff member can post and everyone sees the history, newest first', async () => {
  const db = seed();
  await withApp(db, async (call) => {
    assert.equal((await call('POST', '/api/projects/sual/updates', 'tj', { note: 'Sent shop drawings Rev.0 to ISTS', type: 'Submittal', date: '2026-10-31' })).status, 201);
    assert.equal((await call('POST', '/api/projects/sual/updates', 'renzel', { note: 'Cable pulling done', type: 'Site work', progress: 55, date: '2026-11-01' })).status, 201);
    const project = db.store.get('projects/sual');
    assert.equal(project.actual_site_progress_percent, 55);
    assert.equal(project.latest_update.by, 'RPP');
    const list = await call('GET', '/api/projects/sual/updates', 'viewer');
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.updates.map((u) => u.note), ['Cable pulling done', 'Sent shop drawings Rev.0 to ISTS']);
    assert.equal(list.body.updates[0].previous_progress, 40);
    assert.equal(list.body.updates[1].posted_via, 'app');
  });
});

test('viewers, phone scanners and anonymous callers cannot post', async () => {
  await withApp(seed(), async (call) => {
    assert.equal((await call('POST', '/api/projects/sual/updates', 'viewer', { note: 'x' })).status, 403);
    assert.equal((await call('POST', '/api/projects/sual/updates', 'phone', { note: 'x' })).status, 403);
    assert.equal((await call('POST', '/api/projects/sual/updates', null, { note: 'x' })).status, 401);
    assert.equal((await call('POST', '/api/projects/missing/updates', 'tj', { note: 'x' })).status, 404);
  });
});

test('only the poster or a superadmin deletes an update; latest_update follows', async () => {
  const db = seed();
  await withApp(db, async (call) => {
    const first = await call('POST', '/api/projects/sual/updates', 'renzel', { note: 'first', date: '2026-10-30' });
    const second = await call('POST', '/api/projects/sual/updates', 'renzel', { note: 'second', date: '2026-10-31' });
    assert.equal((await call('DELETE', `/api/projects/sual/updates/${second.body.update.id}`, 'kim')).status, 403);
    assert.equal((await call('DELETE', `/api/projects/sual/updates/${second.body.update.id}`, 'renzel')).status, 200);
    assert.equal(db.store.get('projects/sual').latest_update.note, 'first');
    assert.equal((await call('DELETE', `/api/projects/sual/updates/${first.body.update.id}`, 'tj')).status, 200);
    assert.equal(db.store.get('projects/sual').latest_update, null);
  });
});
