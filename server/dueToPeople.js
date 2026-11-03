'use strict';
// What the company owes each person who paid for company costs themselves.
// Owed = submitted reimbursement claims still pending, less what was already paid
// on them (`paidAmount`, kept up to date by the per-line payment flow). Draft
// liquidations are listed apart: they are not a claim until submitted.
// Capital (equity_contribution) is never owed and never appears here.
// payment_transfers are proof records only, so they are not read.
// Shown on its own, never netted against receivables (RJ, 2026-11-03).

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function summarizeDueToPeople(reimbursements, draftLiquidations) {
  const people = new Map();
  const person = (id, name) => {
    const key = id || name || 'unknown';
    if (!people.has(key)) people.set(key, { employeeId: id || null, name: name || null, owed: 0, claims: [], drafts: [], draftTotal: 0 });
    const p = people.get(key);
    if (!p.name && name) p.name = name;
    return p;
  };
  for (const r of reimbursements) {
    if (r.status !== 'pending') continue;
    const remaining = round2((Number(r.amount) || 0) - (Number(r.paidAmount) || 0));
    if (remaining <= 0.005) continue;
    const p = person(r.employeeId, r.employeeName);
    p.owed = round2(p.owed + remaining);
    p.claims.push({ id: r.id, formNo: r.formNo || null, amount: round2(r.amount), paid: round2(r.paidAmount), remaining, origin: r.origin || null, createdAt: r.createdAt || null });
  }
  for (const l of draftLiquidations) {
    const total = round2(l.total_amount);
    if (!(total > 0)) continue;
    const p = person(l.user_id, l.employee_name);
    p.draftTotal = round2(p.draftTotal + total);
    p.drafts.push({ id: l.id, formNo: l.form_no || null, total, updatedAt: l.updated_at || null });
  }
  const list = [...people.values()].sort((a, b) => b.owed - a.owed || b.draftTotal - a.draftTotal);
  return { people: list, totalOwed: round2(list.reduce((s, p) => s + p.owed, 0)), totalInDrafts: round2(list.reduce((s, p) => s + p.draftTotal, 0)) };
}

module.exports = { summarizeDueToPeople };
