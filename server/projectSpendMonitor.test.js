'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FinanceFirestore } = require('./test-support/financeFirestore');
const { buildProjectSpendMonitor } = require('./projectSpendMonitor');

const rows = (...list) => JSON.stringify(list);
const seed = () => new FinanceFirestore({
  project_expenses: {
    e1: { projectId: 'p1', amount: 1000, sourceType: 'liquidation_sync', sourceLiquidationId: 'L1', sourceLiquidationRowId: 'r1', createdBy: 'kim' },
    e2: { projectId: 'p1', amount: 5000, sourceType: 'po_sync', createdBy: 'rj' },
    e3: { projectId: 'p1', amount: 250, sourceType: 'manual', createdBy: 'rj' },
    e4: { projectId: 'p2', amount: 400, sourceType: 'receipt_scan', createdBy: 'kim' },
    legacy: { projectId: 'p2', amount: 90, sourceType: 'liquidation_sync', sourceLiquidationId: 'L3' },
  },
  overhead_expenses: {
    o1: { amount: 300, sourceType: 'liquidation_sync', sourceLiquidationId: 'L1', sourceLiquidationRowId: 'r2', description: 'Liquidation LQ26-001: Toll', date: '2026-10-02', createdBy: 'kim', liquidationFiledBy: 'Kim' },
    o2: { amount: 1200, sourceType: 'manual', description: 'Hardware store', date: '2026-10-05', createdBy: 'rj' },
    payroll_sync_run1_salaries: { amount: 90000, sourceType: 'payroll_sync', createdBy: 'rj' },
  },
  liquidations: {
    L1: {
      user_id: 'kim', status: 'submitted', form_no: 'LQ26-001-KKS', employee_name: 'Kim',
      rows_json: rows(
        { id: 'r1', amount: 1000, projectId: 'p1', particulars: 'Gas' },
        { id: 'r2', amount: 300, particulars: 'Toll' },
        { id: 'r3', amount: 75, projectId: 'p1', particulars: 'Parking (sync failed)', date: '2026-10-03' },
      ),
    },
    L2: {
      user_id: 'renzel', status: 'draft', form_no: 'LQ26-002-RPP', employee_name: 'Renzel',
      rows_json: rows(
        { id: 'd1', amount: 600, projectId: 'p2', particulars: 'Cable ties' },
        { id: 'd2', amount: 150, particulars: 'Snacks', date: '2026-10-09' },
        { id: 'd3', amount: 0, particulars: 'blank line' },
      ),
    },
    L3: { user_id: 'kim', status: 'submitted', rows_json: rows({ id: 'x1', amount: 90, projectId: 'p2' }, { id: 'x2', amount: 10 }) },
    gone: { user_id: 'kim', status: 'deleted', rows_json: rows({ id: 'z', amount: 999 }) },
  },
});
const admin = { id: 'rj', role: 'admin' };
const kim = { id: 'kim', role: 'user' };

test('splits tagged project spend by source and adds draft liquidation lines as pending', async () => {
  const out = await buildProjectSpendMonitor(seed(), admin);
  assert.deepEqual(out.byProject.p1, { total: 6250, liquidation: 1000, po: 5000, labor: 0, manual: 250, draftLiquidation: 0, draftLines: 0, count: 3 });
  assert.equal(out.byProject.p2.total, 490);
  assert.equal(out.byProject.p2.manual, 400);
  assert.equal(out.byProject.p2.draftLiquidation, 600);
  assert.equal(out.byProject.p2.draftLines, 1);
});

test('untagged = overhead minus payroll, plus untagged draft lines', async () => {
  const out = await buildProjectSpendMonitor(seed(), admin);
  assert.deepEqual(out.untagged.totals, { liquidation: 300, manual: 1200, draft: 150, all: 1650 });
  assert.deepEqual(out.untagged.items.map((i) => [i.kind, i.amount]), [['draft', 150], ['manual', 1200], ['liquidation', 300]]);
  const liq = out.untagged.items.find((i) => i.kind === 'liquidation');
  assert.equal(liq.liquidationId, 'L1');
  assert.equal(liq.liquidationRowId, 'r2');
});

test('flags submitted liquidation lines missing from Finance, skipping legacy-synced forms and drafts', async () => {
  const out = await buildProjectSpendMonitor(seed(), admin);
  assert.equal(out.notInFinance.count, 1);
  assert.equal(out.notInFinance.total, 75);
  assert.equal(out.notInFinance.items[0].liquidationRowId, 'r3');
  assert.equal(out.notInFinance.items[0].projectId, 'p1');
});

test('non-admins get company totals but only their own line items, and no sync check', async () => {
  const out = await buildProjectSpendMonitor(seed(), kim);
  assert.equal(out.scope, 'own');
  assert.equal(out.byProject.p1.total, 6250);
  assert.equal(out.untagged.totals.all, 1650);
  assert.deepEqual(out.untagged.items.map((i) => i.id), ['o1']);
  assert.equal(out.notInFinance, null);
});
