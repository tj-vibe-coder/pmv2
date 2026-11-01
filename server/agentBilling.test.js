'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const agentAccess = require('./agentAccess');
const { createApiAccessGate } = require('./apiAccess');
const { createAgentBillingRouter } = require('./agentBilling');

function fakeDb(seed) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, { ...v }]));
  let auto = 0;
  const docRef = (path) => ({
    id: path.split('/').pop(),
    async get() { const d = store.get(path); return { id: path.split('/').pop(), exists: !!d, data: () => (d ? { ...d } : undefined) }; },
    async update(patch) { store.set(path, { ...store.get(path), ...patch }); },
  });
  const coll = (name) => ({
    doc: (id) => docRef(`${name}/${id}`),
    async add(data) { auto += 1; store.set(`${name}/auto${auto}`, { ...data }); return docRef(`${name}/auto${auto}`); },
    where(field, _op, value) {
      return { get: async () => ({ docs: [...store.keys()].filter((p) => p.startsWith(name + '/') && store.get(p)[field] === value).map((p) => ({ id: p.split('/').pop(), ref: docRef(p), data: () => ({ ...store.get(p) }) })) }) };
    },
  });
  return { collection: coll, store };
}

async function run(fn) {
  const { key, hash } = agentAccess.mintAgentKey();
  const db = fakeDb({
    [`agent_keys/${hash}`]: { name: 'Projects Agent', revokedAt: null, lastUsedAt: new Date().toISOString() },
    'projects/p1': { ovp_number: 'IOCT2610005', project_name: 'MDLZ', updated_contract_amount: 1000000, contract_billed: 0, amount_contract_billed_net: 0 },
  });
  const getCurrentUser = async (req) => agentAccess.lookupAgentKey(db, String(req.headers.authorization || '').replace(/^Bearer /, ''));
  const isActiveUser = (u) => !!u && u.approved === 1;
  const app = express();
  app.use(express.json());
  app.use(createApiAccessGate({ getCurrentUser, isActiveUser }));
  app.use(createAgentBillingRouter({ db, getCurrentUser, isActiveUser }));
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

const inv = { invoice_no: 'SI-014', type: 'down payment', amount: 300000, date: '2026-11-01' };

test('billing creates an invoice and moves the project totals', async () => {
  await run(async (call, db) => {
    const r = await call('POST', '/api/agent/projects/p1/billing', inv);
    assert.equal(r.status, 201);
    assert.equal(r.body.invoice.status, 'unpaid');
    assert.equal(r.body.invoice.due_date, '2026-12-01');
    assert.equal(db.store.get('projects/p1').contract_billed, 300000);
    assert.equal(db.store.get('projects/p1').updated_contract_balance_net, 700000);
  });
});

test('re-posting an invoice updates it by the difference, never duplicates', async () => {
  await run(async (call, db) => {
    await call('POST', '/api/agent/projects/p1/billing', inv);
    const again = await call('POST', '/api/agent/projects/p1/billing', { ...inv, amount: 350000 });
    assert.equal(again.status, 200);
    assert.equal(again.body.created, false);
    assert.equal(db.store.get('projects/p1').contract_billed, 350000);
    assert.equal((await call('GET', '/api/agent/projects/p1/invoices')).body.invoices.length, 1);
  });
});

test('billing validates input and project', async () => {
  await run(async (call) => {
    assert.equal((await call('POST', '/api/agent/projects/p1/billing', { ...inv, type: 'bogus' })).status, 400);
    assert.equal((await call('POST', '/api/agent/projects/p1/billing', { ...inv, amount: -5 })).status, 400);
    assert.equal((await call('POST', '/api/agent/projects/p1/billing', { ...inv, date: '2026-13-40' })).status, 400);
    assert.equal((await call('POST', '/api/agent/projects/p1/billing', { ...inv, invoice_no: '' })).status, 400);
    assert.equal((await call('POST', '/api/agent/projects/zz/billing', inv)).status, 404);
    assert.equal((await call('POST', '/api/agent/projects/p1/billing', inv, null)).status, 401);
  });
});

test('payments accumulate, dedupe by payment_ref and cannot overpay', async () => {
  await run(async (call) => {
    assert.equal((await call('POST', '/api/agent/projects/p1/payments', { invoice_no: 'SI-014', amount: 1 })).status, 404);
    await call('POST', '/api/agent/projects/p1/billing', inv);
    const p1 = await call('POST', '/api/agent/projects/p1/payments', { invoice_no: 'si-014', amount: 100000, date: '2026-11-20', payment_ref: 'OR-1' });
    assert.equal(p1.status, 201);
    assert.equal(p1.body.invoice.status, 'partial');
    const dup = await call('POST', '/api/agent/projects/p1/payments', { invoice_no: 'SI-014', amount: 100000, payment_ref: 'OR-1' });
    assert.equal(dup.body.duplicate, true);
    assert.equal(dup.body.invoice.amount_collected, 100000);
    assert.equal((await call('POST', '/api/agent/projects/p1/payments', { invoice_no: 'SI-014', amount: 250000 })).status, 400);
    const full = await call('POST', '/api/agent/projects/p1/payments', { invoice_no: 'SI-014', amount: 200000 });
    assert.equal(full.body.invoice.status, 'paid');
  });
});
