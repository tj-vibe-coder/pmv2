'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const agentAccess = require('./agentAccess');
const { createApiAccessGate } = require('./apiAccess');
const { createAgentCalcsheetRouter } = require('./agentCalcsheet');
const { isAwardLocked } = require('./calcsheetAward');

function fakeDb(seed) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, { ...v }]));
  let auto = 0;
  const docRef = (path) => ({
    id: path.split('/').pop(),
    async get() { const d = store.get(path); return { id: path.split('/').pop(), exists: !!d, data: () => (d ? { ...d } : undefined) }; },
    async update(patch) { store.set(path, { ...store.get(path), ...patch }); },
  });
  const docsOf = (name) => [...store.keys()].filter((p) => p.startsWith(name + '/')).map((p) => ({ id: p.split('/').pop(), ref: docRef(p), data: () => ({ ...store.get(p) }) }));
  const coll = (name) => ({
    doc: (id) => docRef(`${name}/${id}`),
    async add(data) { auto += 1; store.set(`${name}/auto${auto}`, JSON.parse(JSON.stringify(data))); return docRef(`${name}/auto${auto}`); },
    async get() { return { docs: docsOf(name) }; },
    where(field, _op, value) { return { get: async () => ({ docs: docsOf(name).filter((d) => d.data()[field] === value) }) }; },
  });
  return { collection: coll, store };
}

async function run(fn) {
  const { key, hash } = agentAccess.mintAgentKey();
  const db = fakeDb({
    [`agent_keys/${hash}`]: { name: 'Projects Agent', revokedAt: null, lastUsedAt: new Date().toISOString() },
    'clients/c1': { code: 'MDL', name: 'Mondelez', contacts: [{ name: 'Contact', email: 'contact@example.com' }] },
    'calcsheet_projects/won1': { code: 'PCS2610001-MDL-00', name: 'Won job', status: 'won', customerId: 'c1' },
    'calcsheet_quotations/qwon': { projectId: 'won1', kind: 'IOCT', revision: '00', awardedAt: '2026-10-01T00:00:00Z' },
  });
  let seq = 41;
  const getCurrentUser = async (req) => agentAccess.lookupAgentKey(db, String(req.headers.authorization || '').replace(/^Bearer /, ''));
  const isActiveUser = (u) => !!u && u.approved === 1;
  const app = express();
  app.use(express.json());
  app.use(createApiAccessGate({ getCurrentUser, isActiveUser }));
  app.use(createAgentCalcsheetRouter({
    db, getCurrentUser, isActiveUser,
    nextProjectSeq: async () => { seq += 1; return seq; },
    grandTotal: (q) => (q.components || []).reduce((s, l) => s + (l.unitCost || 0) * (l.qty || 0), 0),
    isAwardLocked,
    validateTiming: () => null,
  }));
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

test('clients list hides contact details', async () => {
  await run(async (call) => {
    const r = await call('GET', '/api/agent/clients');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.clients, [{ id: 'c1', code: 'MDL', name: 'Mondelez' }]);
  });
});

test('creating a proposal assigns a PCS code and starts as draft', async () => {
  await run(async (call) => {
    const r = await call('POST', '/api/agent/calcsheet/projects', { name: 'Diverter upgrade', customerId: 'mdl', date: '2026-11-01' });
    assert.equal(r.status, 201);
    assert.equal(r.body.project.code, 'PCS2611042-MDL-00');
    assert.equal(r.body.project.status, 'draft');
    assert.equal(r.body.project.customerId, 'c1');
    assert.equal((await call('POST', '/api/agent/calcsheet/projects', { name: 'x', customerId: 'nope' })).status, 400);
    assert.equal((await call('POST', '/api/agent/calcsheet/projects', { name: 'x', customerId: 'c1', status: 'won' })).status, 400);
    assert.equal((await call('POST', '/api/agent/calcsheet/projects', { customerId: 'c1' })).status, 400);
  });
});

test('quotations get app defaults plus the agent lines, and updates keep a version', async () => {
  await run(async (call, db) => {
    const p = (await call('POST', '/api/agent/calcsheet/projects', { name: 'Job', customerId: 'c1' })).body.project;
    const r = await call('POST', `/api/agent/calcsheet/projects/${p.id}/quotations`, {
      kind: 'IOCT',
      components: [{ description: 'PLC CPU', brand: 'Siemens', partNo: '6ES7', qty: 2, unitCost: 1000 }, { description: 'PANEL', isHeader: true }],
      services: [{ description: 'Programming', qty: 5, unitPrice: 2000 }],
      terms: { scopeOfWork: 'Supply and program PLC' },
    });
    assert.equal(r.status, 201);
    const q = r.body.quotation;
    assert.equal(q.grandTotal, 2000);
    assert.equal(q.productMarkupPct, 30);
    assert.equal(q.ewtPct, 5);
    assert.equal(q.nonVat, true);
    assert.equal(q.generalReqts.length, 7);
    assert.equal(q.components[0].code, 'B-0010');
    assert.equal(q.components[1].isHeader, true);
    assert.equal(q.services[0].amount, 10000);
    assert.equal(q.servicesFromManpower, false);
    assert.equal(q.termsOverrides.scopeOfWork, 'Supply and program PLC');

    const u = await call('PUT', `/api/agent/calcsheet/quotations/${q.id}`, { productMarkupPct: 25, remarks: 'agent pass 2' });
    assert.equal(u.status, 200);
    assert.equal(u.body.quotation.productMarkupPct, 25);
    const versions = [...db.store.keys()].filter((k) => k.startsWith('calcsheet_quotation_versions/'));
    assert.equal(versions.length, 1);
    assert.equal(db.store.get(versions[0]).data.productMarkupPct, 30);
  });
});

test('agents cannot touch won proposals or awarded quotations, and bad lines are rejected', async () => {
  await run(async (call) => {
    assert.equal((await call('POST', '/api/agent/calcsheet/projects/won1/quotations', { kind: 'IOCT' })).status, 409);
    assert.equal((await call('PUT', '/api/agent/calcsheet/quotations/qwon', { productMarkupPct: 1 })).status, 409);
    assert.equal((await call('PUT', '/api/agent/calcsheet/projects/won1', { name: 'x' })).status, 409);
    const p = (await call('POST', '/api/agent/calcsheet/projects', { name: 'Job', customerId: 'c1' })).body.project;
    assert.equal((await call('POST', `/api/agent/calcsheet/projects/${p.id}/quotations`, { components: [{ qty: 1 }] })).status, 400);
    assert.equal((await call('POST', `/api/agent/calcsheet/projects/${p.id}/quotations`, { components: [{ description: 'x', unitCost: -1 }] })).status, 400);
    assert.equal((await call('POST', `/api/agent/calcsheet/projects/${p.id}/quotations`, { kind: 'XYZ' })).status, 400);
    assert.equal((await call('GET', '/api/agent/calcsheet/projects/zzz')).status, 404);
    assert.equal((await call('GET', '/api/agent/calcsheet/projects', undefined, null)).status, 401);
  });
});
