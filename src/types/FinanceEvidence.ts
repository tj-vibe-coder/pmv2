export const EVIDENCE_TYPES = {
  service_invoice: 'Service Invoice', collection_receipt: 'IOCT Collection Receipt',
  counter_receipt: 'Customer Counter Receipt', bir2307: 'BIR 2307', payment_proof: 'Payment proof',
  deposit_slip: 'Bank deposit slip', supporting_pack: 'Supporting pack',
};
export type EvidenceType = keyof typeof EVIDENCE_TYPES;
export interface DocumentFile {
  id?: string; webUrl: string; filename: string; driveId?: string; itemId?: string;
  mimeType?: string; size?: number | null;
}
export interface CertificateEvidence {
  certificateNumber: string; periodStart: string; periodEnd: string;
  printedIncomeCentavos: number; printedWhtCentavos: number; printedAtc: string; printedDescription: string;
  observedCalculation: string; reviewState: 'unreviewed' | 'matched' | 'discrepancy' | 'resolved';
  reviewNote: string; reviewFlags: string[]; allocations: { invoiceId: string; whtCentavos: number }[];
}
export interface FinanceDocument extends DocumentFile {
  id: string; revision: number; provenance: string; uploadedBy: string; uploadedAt: string;
  certificate?: CertificateEvidence;
}
export interface EvidenceLink {
  id: string; invoiceId: string; documentId: string; type: EvidenceType; active: boolean;
  revision: number; source: string; reference: string; documentDate: string; document: FinanceDocument;
}
export interface InvoiceDocuments {
  links: EvidenceLink[]; legacy: (DocumentFile & { source: string; type: EvidenceType }) | null;
}
