export const WORKFLOW_LABELS: Record<string, string> = {
  awaiting_physical: 'Awaiting physical receipts', awaiting_rj_review: 'Submitted to RJ — awaiting review',
  review_required: 'Form changed — resubmit physical copies', awaiting_payment: 'RJ reviewed — awaiting payment',
  closed: 'Closed', pending_edit: 'Edit pending — open', draft: 'Draft', source_review_required: 'Source needs review',
};
export function reimbursementCashDue(r: { status: string; amount: number; paidAmount?: number }): number {
  return r.status === 'paid' ? 0 : Math.max(0, (Number(r.amount) || 0) - (Number(r.paidAmount) || 0));
}
