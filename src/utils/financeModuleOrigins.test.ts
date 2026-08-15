import {
  cashAdvanceOrigin,
  liquidationRowOrigin,
  reimbursementOrigin,
  reimbursementSummaryFromTrace,
} from './financeModuleOrigins';

test('creates exact origins for cash advances and reimbursements', () => {
  expect(cashAdvanceOrigin({ id: 'ca1' })).toEqual({ type: 'cash_advance', id: 'ca1' });
  expect(reimbursementOrigin({ id: 'rb1' })).toEqual({ type: 'reimbursement', id: 'rb1' });
});

test('creates a row-specific liquidation origin', () => {
  expect(liquidationRowOrigin('l1', { id: 'r1' })).toEqual({
    type: 'liquidation', id: 'l1', rowId: 'r1',
  });
});

test('derives a focused historical reimbursement from normalized trace nodes', () => {
  const summary = reimbursementSummaryFromTrace({
    originKey: 'reimbursement:rb1',
    nodes: [
      {
        key: 'reimbursement:rb1', type: 'reimbursement', id: 'rb1', collection: 'reimbursements',
        label: 'Reimbursement · LQ26-003-RPP', secondaryLabel: 'Renzel', amount: 2636,
        status: 'paid', date: '2026-03-01', focusUrl: '/finance/reimbursements?focus=x',
      },
      {
        key: 'liquidation:l1', type: 'liquidation', id: 'l1', collection: 'liquidations',
        label: 'LQ26-003-RPP', focusUrl: '/finance/expense-monitoring/liquidation-form?focus=x',
      },
      {
        key: 'cash_advance:ca1', type: 'cash_advance', id: 'ca1', collection: 'cash_advances',
        label: 'CA-001', focusUrl: '/finance/expense-monitoring/ca-form?focus=x',
      },
    ],
    edges: [
      { from: 'reimbursement:rb1', to: 'liquidation:l1', relation: 'reimbursed_by', confirmed: true },
      { from: 'reimbursement:rb1', to: 'cash_advance:ca1', relation: 'funded_by_cash_advance', confirmed: true },
    ],
    candidates: [], permissions: { canConfirm: false, canResolve: false },
  });
  expect(summary).toEqual({
    id: 'rb1', liquidationId: 'l1', formNo: 'LQ26-003-RPP', employeeName: 'Renzel',
    amount: 2636, caId: 'ca1', status: 'paid', createdAt: '2026-03-01', historical: true,
  });
});
