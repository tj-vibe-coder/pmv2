import type { FinanceTraceOrigin, FinanceTraceResponse } from '../types/FinanceTrace';

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

export interface FocusedReimbursementSummary {
  id: string;
  liquidationId: string;
  formNo: string | null;
  employeeName: string | null;
  amount: number;
  caId: string | null;
  status: string;
  createdAt: string;
  historical: true;
}

export const reimbursementSummaryFromTrace = (
  trace: FinanceTraceResponse,
): FocusedReimbursementSummary | null => {
  const node = trace.nodes.find((candidate) => (
    candidate.key === trace.originKey && candidate.type === 'reimbursement'
  ));
  if (!node) return null;
  const connectedKeys = trace.edges.flatMap((edge) => {
    if (edge.from === node.key) return [edge.to];
    if (edge.to === node.key) return [edge.from];
    return [];
  });
  const connected = trace.nodes.filter((candidate) => connectedKeys.includes(candidate.key));
  const liquidation = connected.find((candidate) => candidate.type === 'liquidation');
  const cashAdvance = connected.find((candidate) => candidate.type === 'cash_advance');
  const formNo = node.label.startsWith('Reimbursement · ')
    ? node.label.slice('Reimbursement · '.length)
    : liquidation?.secondaryLabel || liquidation?.label || null;
  return {
    id: node.id,
    liquidationId: liquidation?.id || '',
    formNo,
    employeeName: node.secondaryLabel || null,
    amount: Number(node.amount) || 0,
    caId: cashAdvance?.id || null,
    status: node.status || 'unknown',
    createdAt: node.date || '',
    historical: true,
  };
};
