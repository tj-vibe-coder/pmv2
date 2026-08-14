import {
  cashAdvanceOrigin,
  liquidationRowOrigin,
  reimbursementOrigin,
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
