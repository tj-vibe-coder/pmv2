import type { FinanceTraceOrigin } from '../types/FinanceTrace';

export const cashAdvanceOrigin = (record: { id: string }): FinanceTraceOrigin => ({
  type: 'cash_advance', id: record.id,
});

export const reimbursementOrigin = (record: { id: string }): FinanceTraceOrigin => ({
  type: 'reimbursement', id: record.id,
});

export const liquidationRowOrigin = (
  liquidationId: string,
  row: { id: string },
): FinanceTraceOrigin => ({
  type: 'liquidation', id: liquidationId, rowId: row.id,
});
