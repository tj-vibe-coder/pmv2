'use strict';
// One bank/e-wallet transfer (the unit a proof of payment documents) and how it splits
// across cash advances and reimbursement claims. Stored in `payment_transfers`:
// { date, reference, amount, proofRef, remark, payeeName,
//   allocations: [{ type, id, docNo, amount, rowIds }], allocationKeys: ['cash_advance:<id>', …] }
// allocationKeys mirrors allocations so "every transfer touching CA x" is one
// array-contains query (automatic single-field index, no composite needed).

const ALLOCATION_TYPES = ['cash_advance', 'reimbursement'];
const SOURCE_COLLECTION = { cash_advance: 'cash_advances', reimbursement: 'reimbursements' };
const MAX_ALLOCATIONS = 30; // array-contains-any accepts at most 30 values

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function allocationKey(a) { return `${a.type}:${a.id}`; }
function text(v, max) { return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null; }

// Validates a create/update body. proofRef is normalized by the caller (shared helper in server.js).
function normalizeTransferInput(body) {
  const b = body || {};
  const date = String(b.date ?? '').trim();
  const parsed = new Date(date + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return { error: 'Enter a valid transfer date' };
  }
  const amount = round2(b.amount);
  if (!(amount > 0)) return { error: 'Enter the transfer total' };
  const raw = b.allocations;
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'Add at least one cash advance or reimbursement this transfer paid' };
  if (raw.length > MAX_ALLOCATIONS) return { error: `A transfer can cover at most ${MAX_ALLOCATIONS} items` };
  const allocations = [];
  for (const a of raw) {
    if (!a || !ALLOCATION_TYPES.includes(a.type)) return { error: 'Each item must be a cash advance or a reimbursement' };
    const id = typeof a.id === 'string' ? a.id.trim() : '';
    if (!id || id.includes('/')) return { error: 'Each item needs a valid id' };
    const itemAmount = round2(a.amount);
    if (!(itemAmount > 0)) return { error: 'Each item needs a positive amount' };
    let rowIds = null;
    if (a.rowIds != null) {
      if (!Array.isArray(a.rowIds) || a.rowIds.length > 500 || a.rowIds.some(x => typeof x !== 'string' || !x.trim())) return { error: 'rowIds must be a list of line ids' };
      rowIds = a.rowIds.length ? [...new Set(a.rowIds)] : null;
    }
    allocations.push({ type: a.type, id, amount: itemAmount, rowIds });
  }
  const keys = allocations.map(allocationKey);
  if (new Set(keys).size !== keys.length) return { error: 'The same cash advance or reimbursement is listed twice' };
  const allocated = round2(allocations.reduce((s, a) => s + a.amount, 0));
  if (Math.abs(allocated - amount) > 0.005) {
    return { error: `The breakdown adds up to ${allocated.toFixed(2)} but the transfer total is ${amount.toFixed(2)}` };
  }
  return {
    value: {
      date, amount, allocations, allocationKeys: keys,
      reference: text(b.reference, 200), remark: text(b.remark, 1000), payeeName: text(b.payeeName, 200),
    },
  };
}

// Caps each allocation at what its document is worth, counting what other transfers
// already put toward it. `docs` maps key → source doc data; `otherTotals` maps key → sum
// allocated by other transfers. Fills in docNo. Returns an error string or null.
function applyAllocationLimits(allocations, docs, otherTotals) {
  for (const a of allocations) {
    const key = allocationKey(a);
    const doc = docs[key];
    const label = a.type === 'cash_advance' ? 'Cash advance' : 'Reimbursement';
    if (!doc) return `${label} ${a.id} not found`;
    a.docNo = (a.type === 'cash_advance' ? doc.ca_no : doc.formNo) || null;
    if (a.type === 'cash_advance' && doc.status !== 'approved' && doc.status !== 'closed') return `${a.docNo || a.id} is not an approved cash advance`;
    const limit = round2(doc.amount);
    const used = round2((otherTotals[key] || 0) + a.amount);
    if (used > limit + 0.005) {
      const prior = round2(otherTotals[key] || 0);
      return `${a.docNo || a.id} is ${limit.toFixed(2)}${prior > 0 ? `, ${prior.toFixed(2)} of it already in other transfers` : ''} — ${a.amount.toFixed(2)} is too much`;
    }
  }
  return null;
}

// Sums allocations per key across transfers, skipping the one being edited.
function otherAllocationTotals(transfers, excludeId) {
  const totals = {};
  for (const t of transfers) {
    if (t.id === excludeId) continue;
    for (const a of t.allocations || []) totals[allocationKey(a)] = round2((totals[allocationKey(a)] || 0) + (Number(a.amount) || 0));
  }
  return totals;
}

module.exports = {
  ALLOCATION_TYPES, SOURCE_COLLECTION, MAX_ALLOCATIONS,
  allocationKey, normalizeTransferInput, applyAllocationLimits, otherAllocationTotals,
};
