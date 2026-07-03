import type { QuotationKind } from '../../types/Quotation';

// Single source of truth for the default Terms & Conditions paragraphs used in
// both the exported PDF (pdfExport.tsx) and the quotation editor's override
// preview (CalcsheetQuotationEditor.tsx). Keeping these in one place means the
// "default text" the editor previews is always exactly what the PDF renders
// when a termsOverrides field is left blank.

export const ISSUER_NAMES: Record<QuotationKind, string> = {
  IOCT: 'IO Control Technologie OPC',
  ACTI: 'Advance Controle Technologie Inc.',
};

export const DEFAULT_SCOPE_OF_WORK =
  '- The scope of work shall be limited strictly to the items, specifications, and services explicitly stated in this proposal. Any additional works, modifications, or deviations not covered herein shall be treated as a Variation Order and shall be subject to separate quotation, approval, and corresponding adjustment in price and delivery schedule.';

export function defaultBasisOfProposal(issuerName: string): string {
  return `- This offer is based on the technical documents, drawings, specifications, and other references provided by the Client at the time of quotation. ${issuerName} reserves the right to revise pricing, scope, and schedule should there be significant changes, inconsistencies, or incomplete information discovered after award.`;
}

export function defaultDeliveryText(deliveryTerms?: string): string {
  return `- ${deliveryTerms || 'Delivery is 1-2 weeks, upon receipt of a technically and commercially clarified purchase order.'}\n- Delivery terms shall be DDP – Client's Plant Site, unless otherwise specified.`;
}

export const DEFAULT_WARRANTY_EXCLUSION =
  '- Warranty excludes improper installation, unauthorized modifications, misuse, abnormal conditions, power surges, environmental damage, or force majeure events.';
