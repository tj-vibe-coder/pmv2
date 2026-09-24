'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createProposalStore,
  proposeOpportunityUpdate,
  confirmOpportunityProposal,
  rejectOpportunityProposal,
} = require('./proposals');

function fakeOpportunityDb(record, { onUpdate } = {}) {
  let current = { ...record };
  const ref = (id) => ({
    get: async () => ({ id, exists: true, data: () => ({ ...current }) }),
    update: async (patch) => {
      if (onUpdate) onUpdate(patch);
      current = { ...current, ...patch };
    },
  });
  return {
    collection: (name) => {
      assert.equal(name, 'calcsheet_projects');
      return {
        doc: (id) => {
          assert.equal(id, record.id);
          return ref(id);
        },
      };
    },
    runTransaction: async (fn) => fn({
      get: (docRef) => docRef.get(),
      update: (docRef, patch) => { docRef.update(patch); },
    }),
  };
}

const user = { id: 'u-rjr', username: 'RJR' };
const other = { id: 'u-tjc', username: 'TJC' };
const record = {
  id: 'opp1',
  name: 'Rezcoat',
  code: 'PCS2601',
  status: 'sent',
  opportunityGrade: 'B',
  notes: 'old note',
};

test('propose stores a draft and never writes Firestore', async () => {
  const updates = [];
  const db = fakeOpportunityDb(record, { onUpdate: (p) => updates.push(p) });
  const store = createProposalStore({ now: () => 1_000 });
  const result = await proposeOpportunityUpdate({
    db,
    store,
    user,
    args: { opportunityId: 'opp1', field: 'opportunityGrade', value: 'A', reason: 'stronger win signal' },
    asOf: '2026-08-15T00:00:00.000Z',
  });
  assert.equal(result.data.applied, false);
  assert.equal(result.data.field, 'opportunityGrade');
  assert.equal(result.data.currentValue, 'B');
  assert.equal(result.data.proposedValue, 'A');
  assert.ok(result.data.proposalId);
  assert.equal(updates.length, 0);
});

test('confirm applies only the one allowlisted field for the proposing user', async () => {
  const updates = [];
  const db = fakeOpportunityDb(record, { onUpdate: (p) => updates.push(p) });
  const store = createProposalStore({ now: () => 1_000 });
  const proposed = await proposeOpportunityUpdate({
    db,
    store,
    user,
    args: { opportunityId: 'opp1', field: 'status', value: 'for_review' },
    asOf: 't',
  });
  const confirmed = await confirmOpportunityProposal({
    db,
    store,
    user,
    proposalId: proposed.data.proposalId,
  });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.data.applied, true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].status, 'for_review');
  assert.equal(Object.prototype.hasOwnProperty.call(updates[0], 'opportunityGrade'), false);
  assert.ok(updates[0].updatedAt);
});

test('confirm reads and writes inside a single Firestore transaction', async () => {
  let txCalls = 0;
  let current = { ...record };
  const ref = {
    get: async () => ({ id: record.id, exists: true, data: () => ({ ...current }) }),
    update: async (patch) => { current = { ...current, ...patch }; },
  };
  const db = {
    collection: () => ({ doc: () => ref }),
    runTransaction: async (fn) => {
      txCalls += 1;
      return fn({
        get: (docRef) => docRef.get(),
        update: (docRef, patch) => { docRef.update(patch); },
      });
    },
  };
  const store = createProposalStore({ now: () => 1_000 });
  const proposed = await proposeOpportunityUpdate({
    db,
    store,
    user,
    args: { opportunityId: 'opp1', field: 'notes', value: 'via transaction' },
    asOf: 't',
  });
  const confirmed = await confirmOpportunityProposal({
    db,
    store,
    user,
    proposalId: proposed.data.proposalId,
  });
  assert.equal(confirmed.ok, true);
  assert.equal(txCalls, 1);
  assert.equal(current.notes, 'via transaction');
});

test('wrong user cannot confirm or reject another user proposal', async () => {
  const db = fakeOpportunityDb(record);
  const store = createProposalStore({ now: () => 1_000 });
  const proposed = await proposeOpportunityUpdate({
    db,
    store,
    user,
    args: { opportunityId: 'opp1', field: 'notes', value: 'follow up Monday' },
    asOf: 't',
  });
  const denied = await confirmOpportunityProposal({
    db,
    store,
    user: other,
    proposalId: proposed.data.proposalId,
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 403);
  const rejected = rejectOpportunityProposal({
    store,
    user: other,
    proposalId: proposed.data.proposalId,
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.status, 403);
});

test('reject discards the draft without writing', async () => {
  const updates = [];
  const db = fakeOpportunityDb(record, { onUpdate: (p) => updates.push(p) });
  const store = createProposalStore({ now: () => 1_000 });
  const proposed = await proposeOpportunityUpdate({
    db,
    store,
    user,
    args: { opportunityId: 'opp1', field: 'notes', value: 'new note' },
    asOf: 't',
  });
  const rejected = rejectOpportunityProposal({
    store,
    user,
    proposalId: proposed.data.proposalId,
  });
  assert.equal(rejected.ok, true);
  assert.equal(rejected.data.rejected, true);
  assert.equal(updates.length, 0);
  const again = await confirmOpportunityProposal({
    db,
    store,
    user,
    proposalId: proposed.data.proposalId,
  });
  assert.equal(again.status, 404);
});

test('expired proposal cannot be confirmed', async () => {
  let now = 1_000;
  const db = fakeOpportunityDb(record);
  const store = createProposalStore({ ttlMs: 10, now: () => now });
  const proposed = await proposeOpportunityUpdate({
    db,
    store,
    user,
    args: { opportunityId: 'opp1', field: 'status', value: 'inactive' },
    asOf: 't',
  });
  now = 2_000;
  const confirmed = await confirmOpportunityProposal({
    db,
    store,
    user,
    proposalId: proposed.data.proposalId,
  });
  assert.equal(confirmed.ok, false);
  assert.equal(confirmed.status, 404);
});

test('stale current value is a 409 and does not write', async () => {
  const updates = [];
  let current = { ...record };
  const db = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ id: record.id, exists: true, data: () => ({ ...current }) }),
        update: async (patch) => {
          updates.push(patch);
          current = { ...current, ...patch };
        },
      }),
    }),
    runTransaction: async (fn) => fn({
      get: (docRef) => docRef.get(),
      update: (docRef, patch) => { docRef.update(patch); },
    }),
  };
  const store = createProposalStore({ now: () => 1_000 });
  const proposed = await proposeOpportunityUpdate({
    db,
    store,
    user,
    args: { opportunityId: 'opp1', field: 'opportunityGrade', value: 'A' },
    asOf: 't',
  });
  current.opportunityGrade = 'C';
  const confirmed = await confirmOpportunityProposal({
    db,
    store,
    user,
    proposalId: proposed.data.proposalId,
  });
  assert.equal(confirmed.status, 409);
  assert.equal(updates.length, 0);
});

test('won and lost statuses are blocked at propose time', async () => {
  const updates = [];
  const db = fakeOpportunityDb(record, { onUpdate: (p) => updates.push(p) });
  const store = createProposalStore({ now: () => 1_000 });
  await assert.rejects(
    () => proposeOpportunityUpdate({
      db,
      store,
      user,
      args: { opportunityId: 'opp1', field: 'status', value: 'won' },
      asOf: 't',
    }),
    (err) => err.code === 'field_not_allowed',
  );
  await assert.rejects(
    () => proposeOpportunityUpdate({
      db,
      store,
      user,
      args: { opportunityId: 'opp1', field: 'status', value: 'lost' },
      asOf: 't',
    }),
    (err) => err.code === 'field_not_allowed',
  );
  assert.equal(updates.length, 0);
});

test('inherited Object.prototype property names are not allowlisted fields', async () => {
  const updates = [];
  const db = fakeOpportunityDb(record, { onUpdate: (p) => updates.push(p) });
  const store = createProposalStore({ now: () => 1_000 });
  for (const field of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
    await assert.rejects(
      () => proposeOpportunityUpdate({
        db,
        store,
        user,
        args: { opportunityId: 'opp1', field, value: 'anything' },
        asOf: 't',
      }),
      (err) => err.code === 'field_not_allowed',
    );
  }
  assert.equal(updates.length, 0);
});
