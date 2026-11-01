'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createProjectActivityRouter, windowStart } = require('./projectActivity');

function fakeDb(seed) {
  const store = new Map(Object.entries(seed));
  const docsOf = (path) => {
    const depth = path.split('/').length + 1;
    return [...store.keys()]
      .filter((p) => p.startsWith(path + '/') && p.split('/').length === depth)
      .map((p) => ({ id: p.split('/').pop(), data: () => ({ ...store.get(p) }) }));
  };
  const coll = (path) => ({
    doc: (id) => ({ collection: (name) => coll(`${path}/${id}/${name}`) }),
    async get() { return { docs: docsOf(path) }; },
    where(field, op, value) {
      return { get: async () => ({ docs: docsOf(path).filter((d) => (op === '>=' ? String(d.data()[field]) >= value : d.data()[field] === value)) }) };
    },
  });
  return { collection: coll };
}

// "Now" = 2026-11-10 12:00 in the Philippines.
const NOW = Date.parse('2026-11-10T04:00:00Z');
const link = (id) => ({ type: 'project', id, label: id });

function seed() {
  return fakeDb({
    'projects/p1': { ovp_number: 'IOCT001', project_name: 'Diverter', project_status: 'IN PROGRESS', latest_update: { date: '2026-11-09', note: 'FAT done' } },
    'projects/p2': { ovp_number: 'IOCT002', project_name: 'SCADA', project_status: 'IN PROGRESS', latest_update: { date: '2026-01-01', note: 'old' } },
    'projects/p3': { ovp_number: 'IOCT003', project_name: 'Quiet', project_status: 'IN PROGRESS' },
    'projects/p1/updates/u1': { date: '2026-11-09', note: 'FAT done', type: 'Progress', posted_by: 'Projects Agent', posted_via: 'agent', created_at: '2026-11-09T01:00:00Z' },
    'projects/p1/updates/u0': { date: '2026-08-01', note: 'Too old', type: 'Other' },
    'projects/p2/updates/u9': { date: '2026-01-01', note: 'old' },
    'whiteboard_items/a1': { kind: 'todo', visibility: 'general', text: 'Send drawings', done: false, dueDate: '2026-11-08', link: link('p1'), createdVia: 'agent', createdAt: '2026-11-07T00:00:00Z' },
    'whiteboard_items/a2': { kind: 'todo', visibility: 'general', text: 'Book crane', done: false, dueDate: '2026-11-12', link: link('p2'), createdAt: '2026-11-01T00:00:00Z' },
    'whiteboard_items/a3': { kind: 'todo', visibility: 'general', text: 'Old done', done: true, doneAt: '2026-05-01T00:00:00Z', link: link('p1') },
    'whiteboard_items/a4': { kind: 'todo', visibility: 'general', text: 'Not a project item', done: false },
    'project_emails/e1': { project_id: 'p1', date: '2026-11-09T02:00:00.000Z', subject: 'PO released', from: 'buyer@example.com', body: 'secret body' },
    'project_emails/e2': { project_id: 'p1', date: '2026-06-01T02:00:00.000Z', subject: 'old email' },
  });
}

async function run(user, fn, query = '') {
  const app = express();
  app.use(createProjectActivityRouter({ db: seed(), getCurrentUser: async () => user, isActiveUser: (u) => !!u, now: () => NOW }));
  const server = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/project-activity${query}`);
    await fn({ status: r.status, body: await r.json() });
  } finally { server.close(); }
}

test('window start counts today as day one', () => {
  assert.equal(windowStart(7, '2026-11-10'), '2026-11-04');
});

test('summary rolls up items, updates and emails inside the window', async () => {
  await run({ id: 'u1', role: 'user' }, ({ status, body }) => {
    assert.equal(status, 200);
    assert.equal(body.since, '2026-10-12');
    assert.deepEqual(body.action_items.map((i) => i.id), ['a1', 'a2']);
    assert.equal(body.action_items[0].overdue, true);
    assert.deepEqual(body.updates.map((u) => u.id), ['u1']);
    assert.deepEqual(body.emails.map((e) => e.id), ['e1']);
    assert.equal(body.emails[0].body, undefined);
    assert.deepEqual(body.totals, { open_items: 2, overdue_items: 1, due_this_week: 1, done_items: 0, updates: 1, emails: 1, projects_active: 2 });
    assert.equal(body.by_project[0].project_id, 'p1');
    assert.equal(body.by_project[0].overdue_items, 1);
    assert.equal(body.by_project.some((p) => p.project_id === 'p3'), false);
  });
});

test('a longer window brings older done items and emails back', async () => {
  await run({ id: 'u1', role: 'viewer' }, ({ body }) => {
    assert.equal(body.days, 365);
    assert.equal(body.totals.done_items, 1);
    assert.equal(body.emails.length, 2);
    assert.deepEqual(body.updates.map((u) => u.id), ['u1', 'u0', 'u9']);
  }, '?days=365');
});

test('only signed-in staff and agents can read it', async () => {
  await run(null, ({ status }) => assert.equal(status, 401));
  await run({ id: 's', role: 'user', scannerScope: true }, ({ status }) => assert.equal(status, 403));
  await run({ id: 't', role: 'tax_filer' }, ({ status }) => assert.equal(status, 403));
  await run({ id: 'a', role: 'agent', agentScope: true }, ({ status }) => assert.equal(status, 200));
});
