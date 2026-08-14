'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  confirmedReferences,
  isProtectedExpense,
  nodeKey,
  normalizeRecord,
  parseLiquidationRows,
  rankCandidates,
} = require('./financeTrace');

test('nodeKey distinguishes collections and liquidation rows', () => {
  assert.equal(nodeKey({ type: 'investment', id: 'i1' }), 'investment:i1');
  assert.equal(
    nodeKey({ type: 'expense', collection: 'project_expenses', id: 'e1' }),
    'expense:project_expenses:e1',
  );
  assert.equal(
    nodeKey({ type: 'liquidation', id: 'l1', rowId: 'r1' }),
    'liquidation:l1:r1',
  );
});

test('parseLiquidationRows accepts stored JSON and arrays but rejects invalid shapes', () => {
  const rows = [{ id: 'r1', particulars: 'X-ray', amount: 4000 }];
  assert.deepEqual(parseLiquidationRows(JSON.stringify(rows)), rows);
  assert.deepEqual(parseLiquidationRows(rows), rows);
  assert.deepEqual(parseLiquidationRows('{bad json'), []);
  assert.deepEqual(parseLiquidationRows({ id: 'not-array' }), []);
});

test('normalizeRecord creates stable nodes for all finance record types', () => {
  const investment = normalizeRecord({
    type: 'investment', id: 'i1', data: {
      investor: 'TJ Caballero', description: 'Medical for manpower',
      category: 'Capital Contribution', date: '2026-02-27', amount: 4000,
    },
  });
  assert.deepEqual(investment, {
    key: 'investment:i1', type: 'investment', id: 'i1', collection: 'investments',
    label: 'Medical for manpower', secondaryLabel: 'TJ Caballero · Capital Contribution',
    date: '2026-02-27', amount: 4000,
    focusUrl: '/finance/investment-tracker?focus=investment%3Ai1',
  });

  const expense = normalizeRecord({
    type: 'expense', collection: 'project_expenses', id: 'e1', data: {
      description: 'Medical (X-Ray)', projectId: 'p1', projectName: 'RPP',
      date: '2026-02-28', amount: 4000, sourceType: 'liquidation_sync',
    },
  });
  assert.equal(expense.key, 'expense:project_expenses:e1');
  assert.equal(expense.projectId, 'p1');
  assert.equal(expense.projectName, 'RPP');
  assert.equal(expense.sourceType, 'liquidation_sync');

  const liquidation = normalizeRecord({
    type: 'liquidation', id: 'l1', rowId: 'r1',
    data: { form_no: 'LQ26-003-RPP', date_of_submission: '2026-03-01', status: 'submitted' },
    row: { id: 'r1', particulars: 'X-Ray', amount: 4000, projectId: 'p1', projectName: 'RPP' },
  });
  assert.equal(liquidation.label, 'X-Ray');
  assert.equal(liquidation.secondaryLabel, 'LQ26-003-RPP');
  assert.equal(liquidation.amount, 4000);
  assert.equal(
    liquidation.focusUrl,
    '/finance/expense-monitoring/liquidation-form?focus=liquidation%3Al1%3Ar1',
  );

  const ca = normalizeRecord({
    type: 'cash_advance', id: 'ca1', data: {
      ca_no: 'CA-001', purpose: 'Site mobilization', amount: 10000,
      project_id: 'p1', project_name: 'RPP', status: 'approved', requested_at: 1770000000,
    },
  });
  assert.equal(ca.label, 'CA-001');
  assert.equal(ca.amount, 10000);
  assert.equal(ca.projectId, 'p1');

  const reimbursement = normalizeRecord({
    type: 'reimbursement', id: 'rb1', data: {
      formNo: 'LQ26-003-RPP', employeeName: 'Renzel', amount: 2636,
      status: 'paid', createdAt: 1770000000,
    },
  });
  assert.equal(reimbursement.label, 'Reimbursement · LQ26-003-RPP');
  assert.equal(reimbursement.secondaryLabel, 'Renzel');
  assert.equal(reimbursement.status, 'paid');
});

test('confirmedReferences follows only explicit source identifiers', () => {
  assert.deepEqual(confirmedReferences({
    type: 'investment', id: 'i1', data: {
      sourceExpenseId: 'e1', sourceCollection: 'project_expenses',
    },
  }), [{
    origin: { type: 'expense', collection: 'project_expenses', id: 'e1' },
    relation: 'recorded_as_expense',
  }]);

  assert.deepEqual(confirmedReferences({
    type: 'expense', collection: 'project_expenses', id: 'e1', data: {
      sourceLiquidationId: 'l1', sourceLiquidationRowId: 'r1', sourceCaId: 'ca1',
      fundingSource: { type: 'investor_outofpocket', linkedInvestmentId: 'i1' },
    },
  }), [
    { origin: { type: 'investment', id: 'i1' }, relation: 'funded_by' },
    { origin: { type: 'liquidation', id: 'l1', rowId: 'r1' }, relation: 'liquidated_by' },
    { origin: { type: 'cash_advance', id: 'ca1' }, relation: 'funded_by_cash_advance' },
  ]);

  assert.deepEqual(confirmedReferences({
    type: 'liquidation', id: 'l1', rowId: 'r1', data: { ca_id: 'ca1' },
  }), [{ origin: { type: 'cash_advance', id: 'ca1' }, relation: 'funded_by_cash_advance' }]);

  assert.deepEqual(confirmedReferences({
    type: 'reimbursement', id: 'rb1', data: { liquidationId: 'l1', caId: 'ca1' },
  }), [
    { origin: { type: 'liquidation', id: 'l1' }, relation: 'reimbursed_by' },
    { origin: { type: 'cash_advance', id: 'ca1' }, relation: 'funded_by_cash_advance' },
  ]);
});

test('isProtectedExpense recognizes source-owned expense rows', () => {
  assert.equal(isProtectedExpense({ sourceType: 'manual' }), false);
  assert.equal(isProtectedExpense({ sourceType: 'receipt_scan' }), false);
  assert.equal(isProtectedExpense({ sourceType: 'migrated' }), false);
  assert.equal(isProtectedExpense({ sourceType: 'po_sync' }), true);
  assert.equal(isProtectedExpense({ sourceType: 'liquidation_sync' }), true);
  assert.equal(isProtectedExpense({ sourceType: 'payroll_sync' }), true);
  assert.equal(isProtectedExpense({ sourceType: 'ca_writeoff' }), true);
  assert.equal(isProtectedExpense({ sourcePoId: 'po1' }), true);
  assert.equal(isProtectedExpense({ sourceLiquidationId: 'l1' }), true);
});

test('rankCandidates catches centavo and small peso differences using independent signals', () => {
  const origin = {
    type: 'investment', id: 'i1', data: {
      date: '2026-03-14', amount: 494.27, description: 'MICROSOFT MSBILL.INFO SGP',
      category: 'Communication & Utilities', investor: 'TJ Caballero', projectId: 'p1',
    },
  };
  const result = rankCandidates(origin, [
    {
      type: 'expense', collection: 'overhead_expenses', id: 'near-centavo-match', data: {
        date: '2026-03-15', amount: 494.62, description: 'Microsoft MS Bill Info SGP',
        category: 'Communication & Utilities', investor: 'TJ Caballero', projectId: 'p1',
      },
    },
    {
      type: 'expense', collection: 'project_expenses', id: 'only-amount', data: {
        date: '2025-01-01', amount: 494.27, description: 'Unrelated item',
      },
    },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].node.id, 'near-centavo-match');
  assert.equal(result[0].needsReview, true);
  assert.equal(result[0].confirmable, true);
  assert.ok(result[0].evidence.includes('amount within ₱0.35'));
  assert.ok(result[0].evidence.includes('date within 1 day'));
  assert.ok(result[0].evidence.includes('same project'));
  assert.ok(result[0].evidence.some((e) => e.startsWith('matching words:')));
});

test('rankCandidates caps stable score ordering and excludes confirmed nodes', () => {
  const origin = {
    type: 'expense', collection: 'project_expenses', id: 'e1', data: {
      date: '2026-01-10', amount: 1000, description: 'Cement delivery Alpha', projectId: 'p1',
      fundingSource: { linkedInvestmentId: 'already-linked' },
    },
  };
  const candidates = ['z', 'a', 'b', 'c', 'd', 'e', 'already-linked'].map((id) => ({
    type: 'investment', id, data: {
      date: '2026-01-10', amount: 1000, description: 'Cement delivery Alpha', projectId: 'p1',
    },
  }));
  const result = rankCandidates(origin, candidates);
  assert.equal(result.length, 5);
  assert.deepEqual(result.map((c) => c.node.id), ['a', 'b', 'c', 'd', 'e']);
});

test('source-owned inferred candidates are review-only and cannot be confirmed directly', () => {
  const origin = {
    type: 'liquidation', id: 'l1', rowId: 'r1',
    data: { date_of_submission: '2026-02-01' },
    row: { id: 'r1', particulars: 'X-Ray medical', amount: 4000, projectId: 'p1' },
  };
  const result = rankCandidates(origin, [{
    type: 'expense', collection: 'project_expenses', id: 'e1', data: {
      date: '2026-02-01', amount: 4000, description: 'Medical X-Ray', projectId: 'p1',
    },
  }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].confirmable, false);
});
