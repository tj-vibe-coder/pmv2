const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

// Exercise the real handlers from both deployed API copies without opening Firestore.
for (const file of ['server.js', 'functions/server.js']) {
  const source = readFileSync(file, 'utf8');
  async function invoke(user, ca, body, route = 'details') {
    const handlers = {};
    const writes = [];
    const syncs = [];
    const ref = { get: async () => ({ exists: !!ca, data: () => ca }) };
    const context = {
      app: { patch: (path, handler) => { handlers[path] = handler; } },
      getCurrentUser: async () => user,
      db: { collection: () => ({ doc: () => ref }), runTransaction: async fn => fn({
        get: ref.get, update: (_ref, update) => { writes.push(update); Object.assign(ca, update); },
      }) },
      syncExpenseFundingInvestment: async (...args) => { syncs.push(args); },
      console,
    };
    const start = source.indexOf("app.patch('/api/cash-advances/:id/details'");
    const end = source.indexOf('// Backfills/edits', start);
    vm.runInNewContext(source.slice(start, end), context);
    let code = 200; let response;
    const res = { status(value) { code = value; return this; }, json(value) { response = value; return this; } };
    await handlers[`/api/cash-advances/:id${route === 'details' ? '/details' : ''}`]({ params: { id: 'ca1' }, body }, res);
    return { code, response, writes, syncs };
  }
  const base = () => ({ user_id: 'owner', status: 'pending', amount: 100, balance_remaining: 0, ca_no: 'CA1' });
  const body = () => ({ purpose: 'Site visit', project_id: null, date_requested: '2026-10-06', breakdown: [{ category: 'Transportation', description: 'Fare', amount: 150 }] });

  test(`${file}: owner can edit pending request; total comes from breakdown`, async () => {
    const result = await invoke({ id: 'owner', role: 'user' }, base(), { ...body(), amount: 999, status: 'approved', user_id: 'other' });
    assert.equal(result.code, 200);
    assert.equal(result.writes[0].amount, 150);
    assert.equal(result.writes[0].balance_remaining, undefined);
    assert.equal(result.writes[0].status, undefined);
    assert.equal(result.writes[0].user_id, undefined);
    assert.equal(result.syncs.length, 0);
  });
  test(`${file}: rejects unauthenticated, other owners, and approved edits by ordinary admins`, async () => {
    assert.equal((await invoke(null, base(), body())).code, 401);
    assert.equal((await invoke({ id: 'other', role: 'user' }, base(), body())).code, 403);
    for (const role of ['user', 'admin']) {
      const result = await invoke({ id: 'owner', role }, { ...base(), status: 'approved' }, body());
      assert.equal(result.code, 403);
      assert.equal(result.writes.length, 0);
    }
  });
  test(`${file}: superadmin approved edit preserves spent funds and syncs funding`, async () => {
    const ca = { ...base(), status: 'approved', balance_remaining: -20, approved_at: 1780000000 };
    const result = await invoke({ id: 'super', role: 'superadmin' }, ca, body());
    assert.equal(result.code, 200);
    assert.equal(ca.balance_remaining, 30);
    assert.equal(ca.status, 'approved');
    assert.equal(result.syncs.length, 1);
    assert.equal(result.syncs[0][2].amount, 150);
  });
  test(`${file}: superadmin can reduce approved amount without resetting liquidation`, async () => {
    const ca = { ...base(), status: 'approved', balance_remaining: 20, approved_at: 1780000000 };
    const result = await invoke({ id: 'super', role: 'superadmin' }, ca, { ...body(), breakdown: [{ amount: 50 }] });
    assert.equal(result.code, 200);
    assert.equal(ca.balance_remaining, -30);
  });
  test(`${file}: rejects invalid details and missing records without writes`, async () => {
    assert.equal((await invoke({ id: 'owner' }, null, body())).code, 404);
    for (const invalid of [
      { purpose: '', project_id: null }, { date_requested: '2026-02-30' },
      { breakdown: [] }, { breakdown: [{ amount: -1 }] }, { breakdown: [{ amount: 'Infinity' }] },
    ]) {
      const result = await invoke({ id: 'owner' }, base(), { ...body(), ...invalid });
      assert.equal(result.code, 400);
      assert.equal(result.writes.length, 0);
    }
  });
  test(`${file}: closed request can have details corrected but issued amount stays fixed`, async () => {
    const user = { id: 'super', role: 'superadmin' };
    assert.equal((await invoke(user, { ...base(), status: 'closed' }, body())).code, 400);
    const result = await invoke(user, { ...base(), status: 'closed' }, { ...body(), breakdown: [{ amount: 100 }] });
    assert.equal(result.code, 200);
    assert.equal(result.writes[0].balance_remaining, undefined);
    assert.equal(result.syncs.length, 0);
  });
  test(`${file}: approval uses edited total and still requires admin`, async () => {
    const ca = base();
    await invoke({ id: 'owner' }, ca, body());
    const result = await invoke({ id: 'admin', role: 'admin' }, ca, { status: 'approved' }, 'approval');
    assert.equal(result.code, 200);
    assert.equal(ca.balance_remaining, 150);
    assert.equal((await invoke({ id: 'owner', role: 'user' }, base(), { status: 'approved' }, 'approval')).code, 403);
  });
}
