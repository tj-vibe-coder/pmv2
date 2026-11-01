'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const agentAccess = require('./agentAccess');
const { createApiAccessGate } = require('./apiAccess');
const { createAgentProjectLogRouter } = require('./agentProjectLog');

const DELETE = Symbol('delete');

function fakeDb(seed) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
  let auto = 0;
  const docRef = (path) => ({
    id: path.split('/').pop(),
    async get() { const d = store.get(path); return { id: path.split('/').pop(), exists: !!d, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined) }; },
    async set(data) { store.set(path, JSON.parse(JSON.stringify(data))); },
    async update(patch) {
      const next = { ...store.get(path) };
      for (const [k, v] of Object.entries(patch)) { if (v === DELETE) delete next[k]; else next[k] = v; }
      store.set(path, JSON.parse(JSON.stringify(next)));
    },
  });
  const docsOf = (name) => [...store.keys()].filter((p) => p.startsWith(name + '/')).map((p) => ({ id: p.split('/').pop(), ref: docRef(p), data: () => JSON.parse(JSON.stringify(store.get(p))) }));
  const coll = (name) => ({
    doc: (id) => docRef(`${name}/${id}`),
    async add(data) { auto += 1; await docRef(`${name}/auto${auto}`).set(data); return docRef(`${name}/auto${auto}`); },
    where(field, _op, value) { return { get: async () => ({ docs: docsOf(name).filter((d) => d.data()[field] === value) }) }; },
  });
  return { collection: coll, store };
}

async function run(fn) {
  const { key, hash } = agentAccess.mintAgentKey();
  const db = fakeDb({
    [`agent_keys/${hash}`]: { name: 'Projects Agent', revokedAt: null, lastUsedAt: new Date().toISOString() },
    'projects/p1': { ovp_number: 'IOCT2610005', project_name: 'MDLZ Diverter System' },
    'whiteboard_items/human1': { kind: 'todo', visibility: 'general', category: 'project', text: 'Human task', done: false, link: { type: 'project', id: 'p1', label: 'x' }, createdBy: 'u1' },
    'whiteboard_items/rep1': { kind: 'todo', visibility: 'general', text: 'Weekly report', done: false, recurrence: 'weekly', link: { type: 'project', id: 'p1', label: 'x' }, createdBy: 'u1' },
    'whiteboard_items/priv': { kind: 'todo', visibility: 'private', text: 'Mine', link: { type: 'project', id: 'p1', label: 'x' }, createdBy: 'u1' },
  });
  const getCurrentUser = async (req) => agentAccess.lookupAgentKey(db, String(req.headers.authorization || '').replace(/^Bearer /, ''));
  const isActiveUser = (u) => !!u && u.approved === 1;
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(createApiAccessGate({ getCurrentUser, isActiveUser }));
  app.use(createAgentProjectLogRouter({ db, getCurrentUser, isActiveUser, deleteField: DELETE }));
  const server = app.listen(0);
  const call = async (method, url, body, token = key) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  try { await fn(call, db); } finally { server.close(); }
}

const email = {
  message_id: '<abc@mail.example.com>', subject: 'PO 4500123 released', from: 'buyer@example.com', to: ['projects@example.com'],
  date: '2026-11-01T09:30:00+08:00', summary: 'Client released the PO.', body: 'Full text here', attachments: [{ name: 'PO.pdf', size: 1200 }],
};

test('emails are logged once per message_id and listed without bodies by default', async () => {
  await run(async (call) => {
    const r = await call('POST', '/api/agent/projects/p1/emails', email);
    assert.equal(r.status, 201);
    assert.equal(r.body.email.has_body, true);
    assert.equal(r.body.email.project_no, 'IOCT2610005');
    const dup = await call('POST', '/api/agent/projects/p1/emails', { ...email, subject: 'changed' });
    assert.equal(dup.body.duplicate, true);
    const list = await call('GET', '/api/agent/projects/p1/emails');
    assert.equal(list.body.emails.length, 1);
    assert.equal(list.body.emails[0].body, undefined);
    assert.equal((await call('GET', '/api/agent/projects/p1/emails?full=1')).body.emails[0].body, 'Full text here');
  });
});

test('email input is validated', async () => {
  await run(async (call) => {
    assert.equal((await call('POST', '/api/agent/projects/p1/emails', { ...email, message_id: '' })).status, 400);
    assert.equal((await call('POST', '/api/agent/projects/p1/emails', { ...email, date: 'yesterday' })).status, 400);
    assert.equal((await call('POST', '/api/agent/projects/p1/emails', { ...email, link: 'http://insecure' })).status, 400);
    assert.equal((await call('POST', '/api/agent/projects/p1/emails', { ...email, direction: 'sideways' })).status, 400);
    assert.equal((await call('POST', '/api/agent/projects/nope/emails', email)).status, 404);
    assert.equal((await call('POST', '/api/agent/projects/p1/emails', email, null)).status, 401);
  });
});

test('action items land on the General board as project to-dos', async () => {
  await run(async (call, db) => {
    const r = await call('POST', '/api/agent/projects/p1/action-items', {
      text: 'Send revised drawings', owner: 'renzel', due_date: '2026-11-05', subtasks: ['Update IO list', 'Export PDF'],
      source_ref: 'abc#1', email_message_id: email.message_id,
    });
    assert.equal(r.status, 201);
    const stored = db.store.get(`whiteboard_items/${r.body.action_item.id}`);
    assert.equal(stored.kind, 'todo');
    assert.equal(stored.visibility, 'general');
    assert.equal(stored.category, 'project');
    assert.equal(stored.text, '[RPP] Send revised drawings');
    assert.deepEqual(stored.link, { type: 'project', id: 'p1', label: 'IOCT2610005 · MDLZ Diverter System' });
    assert.equal(stored.subtasks.length, 2);
    const dup = await call('POST', '/api/agent/projects/p1/action-items', { text: 'Send revised drawings again', source_ref: 'abc#1' });
    assert.equal(dup.body.duplicate, true);
    const list = await call('GET', '/api/agent/projects/p1/action-items');
    assert.deepEqual(list.body.action_items.map((i) => i.id).sort(), ['auto1', 'human1', 'rep1'].sort());
    assert.equal((await call('POST', '/api/agent/projects/p1/action-items', { text: 'x', owner: 'bob' })).status, 400);
    assert.equal((await call('POST', '/api/agent/projects/p1/action-items', { text: '' })).status, 400);
  });
});

test('agents tick, note and edit their items, but only tick others', async () => {
  await run(async (call, db) => {
    const id = (await call('POST', '/api/agent/projects/p1/action-items', { text: 'Follow up PO', due_date: '2026-11-05' })).body.action_item.id;
    const noted = await call('PUT', `/api/agent/action-items/${id}`, { note: 'Client replied, waiting on signature', progress: 50, due_date: '2026-11-07' });
    assert.equal(noted.status, 200);
    assert.equal(noted.body.action_item.progress, 50);
    assert.equal(noted.body.action_item.due_date, '2026-11-07');
    const done = await call('PUT', `/api/agent/action-items/${id}`, { done: true });
    assert.equal(done.body.action_item.done, true);
    assert.equal(done.body.action_item.done_by, 'Projects Agent');
    const undone = await call('PUT', `/api/agent/action-items/${id}`, { done: false });
    assert.equal(undone.body.action_item.done_by, null);

    assert.equal((await call('PUT', '/api/agent/action-items/human1', { done: true })).status, 200);
    assert.equal((await call('PUT', '/api/agent/action-items/human1', { text: 'rename' })).status, 403);
    assert.equal((await call('PUT', '/api/agent/action-items/rep1', { done: true })).status, 409);
    assert.equal((await call('PUT', '/api/agent/action-items/priv', { done: true })).status, 404);
    assert.equal(db.store.get('whiteboard_items/priv').done, undefined);
  });
});
