export type SoaStatus = 'draft' | 'issued' | 'for_payment' | 'partially_paid' | 'settled' | 'cancelled';

export const SOA_STATUSES: SoaStatus[] = [
  'draft',
  'issued',
  'for_payment',
  'partially_paid',
  'settled',
  'cancelled',
];

export function soaStatusLabel(status: SoaStatus): string {
  switch (status) {
    case 'for_payment':
      return 'For Payment';
    case 'partially_paid':
      return 'Partially Paid';
    case 'settled':
      return 'Settled';
    case 'issued':
      return 'Issued';
    case 'draft':
      return 'Draft';
    case 'cancelled':
      return 'Cancelled';
    default:
      return String(status);
  }
}

export interface SoaItem {
  id: string;
  projectId?: string | null;           // Linked Project ID in PMV2 projects collection
  projectNo?: string;                 // Project No. (e.g. "2026-005" or "PCS2606005")
  projectName: string;                // e.g. "Ebecor", "Analog Devices", "Tann Philippines"
  description: string;                // e.g. "Ebecor Lear MES Connectivity - 6 units"
  completionDateText?: string;        // e.g. "Completion: March 2026" or "Completion: June 23, 2026"
  poNumber?: string;                  // e.g. "2606-005" (empty/absent if pending PO)
  poDate?: string;                    // e.g. "06/06/2026" or "2026-06-06"
  amount: number;                     // Subcontract / Billing amount in PHP (VAT-EX)
  hasPo: boolean;                     // true -> with PO, false -> pending PO
  footnoteSymbol?: '*' | '**' | string; // Optional footnote marker
  notes?: string;
}

export interface SoaFootnote {
  symbol: string;                     // e.g. "*", "**"
  text: string;                       // Explanation
}

export interface StatementOfAccount {
  id: string;                         // Firestore document ID
  soaNo: string;                      // e.g. "SOA2607001-ACT-00"
  revision: string;                   // e.g. "00", "01"
  date: string;                       // 'YYYY-MM-DD'
  currency: string;                   // 'PHP'
  status: SoaStatus;                  // 'for_payment', 'settled', etc.

  // Recipient / Counterparty
  recipientId?: string | null;        // Client ID in clients collection
  recipientCode: string;              // e.g. "ACT"
  recipientName: string;              // "Advance Controle Technologie Inc"
  recipientContactName: string;       // "Lindsey Salilig"
  recipientContactPhone?: string;     // "0917-5046701"
  recipientContactEmail?: string;
  recipientAddress: string;           // "Block 13 Lot 8, Mindanao Ave., Cavite..."

  // Salutation & Subject
  subject: string;                    // "Consolidated Statement of Account – Outstanding Billings"
  salutation?: string;                // "Dear Sir Lindsey," or default derived from contact name
  bodyText?: string;                  // Standard intro text

  // Line items & Footnotes
  items: SoaItem[];
  footnotes: SoaFootnote[];

  // Computed summary amounts (VAT-EX)
  subtotalWithPo: number;
  subtotalPendingPo: number;
  totalOutstanding: number;

  // Signatory & Prepared By
  preparedByName: string;             // "Reuel Joshua Rivera"
  preparedByTitle: string;            // "Solutions Manager"
  preparedByPhone: string;            // "+63 919 082 5434"
  preparedByEmail: string;            // "rj.rivera@iocontroltech.com"

  // Settlement Tracking & Payment Collections
  amountCollected: number;
  balanceRemaining: number;
  settlementDate?: string | null;
  collections?: SoaPaymentRecord[];

  // Corporate OneDrive Synchronization
  onedrive_item_id?: string;
  onedrive_web_url?: string;
  onedrive_uploaded_at?: string;

  // Revision Tracking
  previousRevisionId?: string;
  previousSoaNo?: string;

  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface SoaPaymentRecord {
  id: string;
  amount: number;
  date: string;
  reference?: string;
  invoiceId?: string | null;
  notes?: string;
  recordedBy?: string;
  recordedAt?: string;
}

export interface SoaSummaryTotals {
  subtotalWithPo: number;
  subtotalPendingPo: number;
  totalOutstanding: number;
}

export function computeSoaTotals(items: SoaItem[]): SoaSummaryTotals {
  let subtotalWithPo = 0;
  let subtotalPendingPo = 0;

  for (const item of items) {
    const amt = Number(item.amount) || 0;
    if (item.hasPo) {
      subtotalWithPo += amt;
    } else {
      subtotalPendingPo += amt;
    }
  }

  return {
    subtotalWithPo: Math.round(subtotalWithPo * 100) / 100,
    subtotalPendingPo: Math.round(subtotalPendingPo * 100) / 100,
    totalOutstanding: Math.round((subtotalWithPo + subtotalPendingPo) * 100) / 100,
  };
}

export const DEFAULT_SOA_FOOTNOTES: SoaFootnote[] = [
  {
    symbol: '*',
    text: 'No Purchase Order has been issued yet and final pricing is still pending agreement with the client. Work has already been rendered and is 100% complete.',
  },
  {
    symbol: '**',
    text: 'No Purchase Order has been issued yet; pricing already mirrors PO 2606-005 (5% discount applied) as scope and value are identical. Work has already been rendered and is 100% complete.',
  },
];

export const DEFAULT_SOA_BODY_TEXT =
  'Please find below the consolidated statement of account for engineering services rendered across the following projects, whether or not a Purchase Order has been formally issued. All work reflected herein has been completed.';
