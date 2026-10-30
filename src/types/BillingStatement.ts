export type BillingDocKind = 'BLS' | 'SOA';

export interface BlsRefRow {
  label: string;
  value: string;
}

export interface BlsLine {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

export interface BillingFile {
  onedrive_item_id: string;
  onedrive_web_url: string;
  filename: string;
  uploaded_at: string;
}

/**
 * A Billing Statement (BLS): the document for one project/milestone sent with the
 * Service Invoice. Also the record for an imported BLS/SOA PDF (`source: 'imported'`,
 * `file` set, no `lines`). Doc no. follows `<ProjectNo>-BLS-NN`; imports keep their
 * existing numbers.
 */
export interface BillingStatement {
  id: string;
  kind: BillingDocKind;
  docNo: string;
  date: string;                       // 'YYYY-MM-DD'
  projectId?: string;
  projectNo: string;
  projectName?: string;
  billedToName?: string;
  billedToAddress?: string;           // newline-separated
  attention?: string;
  subtitle?: string;
  billingLabel?: string;              // e.g. "Final (100%)"
  refRows?: BlsRefRow[];
  lines?: BlsLine[];
  whtPct?: number;                    // 0 hides the withholding row
  supportingDocs?: string[];
  terms?: string;
  approverLabel?: string;
  preparedByName?: string;
  preparedByTitle?: string;
  invoiceId?: string;
  invoiceNo?: string;
  file?: BillingFile | null;
  source?: 'generated' | 'imported';
  notes?: string;
  totalGross?: number;
  totalWht?: number;
  totalNet?: number;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

export const DEFAULT_BLS_SUBTITLE = 'For verification and approval prior to issuance of Service Invoice';
export const DEFAULT_BLS_TERMS =
  'Back-to-back with end-user payment terms. Please issue BIR Form 2307 for the tax withheld upon payment.';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function computeBlsTotals(lines: BlsLine[] | undefined, whtPct: number | undefined) {
  const gross = round2((lines ?? []).reduce((s, l) => s + round2((Number(l.qty) || 0) * (Number(l.unitPrice) || 0)), 0));
  const wht = round2((gross * (Number(whtPct) || 0)) / 100);
  return { gross, wht, net: round2(gross - wht) };
}

const ONES = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function words(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${words(n % 100)}` : ''}`;
  for (const [size, name] of [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']] as const) {
    if (n >= size) return `${words(Math.floor(n / size))} ${name}${n % size ? ` ${words(n % size)}` : ''}`;
  }
  return '';
}

/** "Two Hundred Sixteen Thousand ... Pesos and 41/100 Only" */
export function pesoInWords(amount: number): string {
  const x = round2(amount);
  const whole = Math.floor(x);
  const cents = Math.round((x - whole) * 100);
  return `${words(whole)} Pesos and ${String(cents).padStart(2, '0')}/100 Only`;
}

/** Doc type (BLS / SOA) read from a filename like IOCT2606001-BLS-01.pdf; null if unknown. */
export function parseDocFilename(filename: string): { docNo: string; kind: BillingDocKind; projectNo: string } | null {
  const base = filename.replace(/\.[^.]+$/, '');
  const m = /^(IOCT\d{7}|PCS\d{7})-(BLS|SOA)-/i.exec(base);
  if (!m) return null;
  return { docNo: base, kind: m[2].toUpperCase() as BillingDocKind, projectNo: m[1].toUpperCase() };
}
