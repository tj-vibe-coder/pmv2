// Parse a legacy quotation PDF for the bits we need to record it as a legacy
// quotation in pmv2. Used when the source .xlsx is missing/corrupted but the
// issued PDF is intact. Extracts header metadata, section subtotals (A/B/C),
// and the final grand total + VAT mode. Line items are not extracted — the
// legacy formulation short-circuits to the snapshot totals anyway, and the
// user has the original PDF on disk for line-item reference.

import type { QuotationKind } from '../../types/Quotation';

export interface ParsedLegacyPdf {
  // Header
  refCode: string;                       // e.g. "PCS2602004-ACT-00"
  baseCode: string;                      // PCS2602004-ACT (no rev)
  revision: string;                      // "00"
  kind: QuotationKind | 'unknown';       // from letterhead
  date: string;                          // ISO date "2026-02-25"
  rawDate: string;                       // "25 Feb 2026"
  validityDays: number;
  warrantyMonths: number;

  // Recipient (best-effort)
  recipientName: string;
  recipientContact: string;
  recipientEmail: string;
  recipientAddress: string;

  // Project
  projectName: string;

  // Terms
  paymentTerms: string;
  deliveryTerms: string;
  authorizedBy: string;

  // Totals
  vatMode: 'VAT-EX' | 'VAT-IN' | 'unknown';
  vatPct: number;                        // 0 when VAT-EX, 12 when VAT-IN
  subtotal: number;
  vat: number;
  grandTotal: number;

  // Section subtotals (when found)
  sectionA: number;                      // General Requirements
  sectionB: number;                      // Components
  sectionC: number;                      // Engineering Services

  warnings: string[];
  sourceFile: string;
  rawText: string;                       // for debugging / fallback display
}

let pdfjsPromise: Promise<any> | null = null;
async function loadPdfjs(): Promise<any> {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    const pdfjs = await import(/* webpackChunkName: "pdfjs" */ 'pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc =
      `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;
    return pdfjs;
  })();
  return pdfjsPromise;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function toNumber(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[₱$,\s]/g, '').replace(/[()]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function looksLikeNumber(s: string): boolean {
  return /^[₱$\s]*-?[\d,]+(?:\.\d+)?[\s]*$/.test(s.trim()) && s.replace(/[^\d]/g, '').length > 0;
}

// Find the index of the first token at or after `start` matching `pred`.
function findIndex(items: string[], pred: (s: string) => boolean, start = 0): number {
  for (let i = start; i < items.length; i++) if (pred(items[i])) return i;
  return -1;
}

// Look forward from `start` for the next numeric token, skipping the currency glyph alone.
function findNextNumber(items: string[], start: number, maxLookahead = 12): number {
  for (let i = start; i < Math.min(items.length, start + maxLookahead); i++) {
    const t = items[i].trim();
    if (!t) continue;
    if (t === '₱' || t === 'PHP' || t === '$') continue;
    if (looksLikeNumber(t)) return toNumber(t);
  }
  return 0;
}

function findAfterAnchor(items: string[], anchorRe: RegExp, maxLookahead = 8): string {
  for (let i = 0; i < items.length; i++) {
    if (anchorRe.test(items[i])) {
      for (let j = i + 1; j < Math.min(items.length, i + 1 + maxLookahead); j++) {
        const t = items[j].trim();
        if (!t) continue;
        // Skip empty-ish separators
        if (/^[:|\-–—]+$/.test(t)) continue;
        return t;
      }
    }
  }
  return '';
}

function parseDate(raw: string): string {
  // Try "25 Feb 2026" or "Feb 25, 2026" or ISO
  const tryFormats = [
    raw,
    raw.replace(/,/g, ''),
  ];
  for (const s of tryFormats) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return '';
}

// ── main ──────────────────────────────────────────────────────────────────────

export async function parseLegacyPdf(file: File): Promise<ParsedLegacyPdf> {
  const warnings: string[] = [];
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf, disableFontFace: true }).promise;

  // Gather text from all pages, in reading order as best as pdfjs exposes it.
  const items: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const it of content.items as Array<{ str?: string }>) {
      const s = (it.str || '').trim();
      if (s) items.push(s);
    }
  }
  try { await doc.destroy(); } catch { /* ignore */ }

  const rawText = items.join(' | ');

  // ── Issuer (letterhead) ───────────────────────────────────────────────────
  const headerBlob = items.slice(0, 40).join(' ').toLowerCase();
  let kind: QuotationKind | 'unknown' = 'unknown';
  if (headerBlob.includes('io control technologie') || headerBlob.includes('iocontroltech')) kind = 'IOCT';
  else if (headerBlob.includes('advance controle technologie') || headerBlob.includes('acti')) kind = 'ACTI';
  if (kind === 'unknown') warnings.push('Could not detect issuer (IOCT vs ACTI) from letterhead');

  // ── Header fields ─────────────────────────────────────────────────────────
  const refCode = findAfterAnchor(items, /^Ref\s*No\.?:?$/i) ||
    (items.find((t) => /^PCS\d{4}\d{3}-[A-Z&]{2,4}-\d{2}$/.test(t)) ?? '');
  const m = refCode.match(/^(PCS\d{4}\d{3}-[A-Z&]{2,4})-(\d{2})$/);
  const baseCode = m ? m[1] : refCode.replace(/-\d{2}$/, '');
  const revision = m ? m[2] : '00';

  const rawDate = findAfterAnchor(items, /^Date:?$/i);
  const date = parseDate(rawDate);
  if (!date) warnings.push(`Could not parse date "${rawDate}"`);

  const validityRaw = findAfterAnchor(items, /^Validity:?$/i);
  const validityDays = parseInt((validityRaw.match(/(\d+)/) || ['', '30'])[1], 10) || 30;

  // Warranty from terms text — typical phrasing "warranted for twelve (12) months"
  let warrantyMonths = 12;
  const warMatch = rawText.match(/(\d+)\s*\)\s*months/i) || rawText.match(/warrant\w+ for\s+\w+\s*\((\d+)\)/i);
  if (warMatch) warrantyMonths = parseInt(warMatch[1], 10) || 12;

  // Project name — anchor "Project" sometimes appears alone or as "Project Name"
  const projectName = findAfterAnchor(items, /^Project(\s*Name)?:?$/i) ||
    findAfterAnchor(items, /^Project:?$/i);

  // ── Recipient block ───────────────────────────────────────────────────────
  // Layout: after Ref/Date/Validity comes the recipient name, contact, email, address,
  // then "Project". We find the index of Validity value and walk forward until "Project".
  let recipientName = '', recipientContact = '', recipientEmail = '', recipientAddress = '';
  const validityIdx = findIndex(items, (t) => /^Validity:?$/i.test(t));
  const projectIdx = findIndex(items, (t) => /^Project(\s*Name)?:?$/i.test(t));
  if (validityIdx >= 0 && projectIdx > validityIdx) {
    // Skip Validity value token(s) ("30", "days")
    let i = validityIdx + 1;
    while (i < projectIdx && (/^\d+$/.test(items[i].trim()) || /^days$/i.test(items[i].trim()))) i++;
    const recipientBlock = items.slice(i, projectIdx).filter((t) => t && !/^[:|\-–—]+$/.test(t));
    if (recipientBlock.length) {
      recipientName = recipientBlock[0] || '';
      // contact is usually the next short non-email line
      for (let j = 1; j < recipientBlock.length; j++) {
        const t = recipientBlock[j];
        if (/@/.test(t)) { recipientEmail = t; continue; }
        if (!recipientContact && t.length < 50 && !/,/.test(t)) { recipientContact = t; continue; }
        recipientAddress += (recipientAddress ? ' ' : '') + t;
      }
    }
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  // Find "TOTAL PRICE, PHP (VAT-EX)" or "(VAT-IN)" then the number that follows.
  let vatMode: 'VAT-EX' | 'VAT-IN' | 'unknown' = 'unknown';
  let grandTotal = 0;
  for (let i = 0; i < items.length; i++) {
    const t = items[i];
    if (/TOTAL\s*PRICE.*VAT[- ]?EX/i.test(t)) {
      vatMode = 'VAT-EX';
      grandTotal = findNextNumber(items, i + 1, 8);
      break;
    }
    if (/TOTAL\s*PRICE.*VAT[- ]?IN/i.test(t)) {
      vatMode = 'VAT-IN';
      grandTotal = findNextNumber(items, i + 1, 8);
      break;
    }
  }
  if (!grandTotal) {
    // Fallback: scan for the LAST line that looks like "TOTAL PRICE" + number nearby
    const totalIdx = items.findIndex((t) => /TOTAL\s*PRICE/i.test(t));
    if (totalIdx >= 0) grandTotal = findNextNumber(items, totalIdx + 1, 12);
    if (!grandTotal) warnings.push('Could not find grand total — please enter manually');
  }

  const vatPct = vatMode === 'VAT-IN' ? 12 : 0;
  const subtotal = vatMode === 'VAT-IN' ? +(grandTotal / 1.12).toFixed(2) : grandTotal;
  const vat = vatMode === 'VAT-IN' ? +(grandTotal - subtotal).toFixed(2) : 0;

  // ── Section subtotals (Summary block lists A/B/C with their totals) ───────
  // Each label appears twice in the doc — once as the section header (with the
  // full line-item table after it), and once again in the Summary recap. We
  // want the Summary recap occurrence because numbers are right next to the
  // label there. Locate the Summary anchor and search after it.
  const summaryStart = findIndex(items, (t) => /^Summary$/i.test(t));
  const sectionLine = (label: RegExp): number => {
    // Try Summary block first
    if (summaryStart >= 0) {
      const idx = findIndex(items, (t) => label.test(t), summaryStart);
      if (idx >= 0) {
        // In Summary the value is within ~4 tokens; "-" means zero.
        for (let j = idx + 1; j < Math.min(items.length, idx + 5); j++) {
          const t = items[j].trim();
          if (!t) continue;
          if (t === '₱' || t === 'PHP') continue;
          if (t === '-' || t === '—') return 0;
          if (looksLikeNumber(t)) return toNumber(t);
          // Stop if we hit the next section label
          if (/^[A-C]\.\s/.test(t)) break;
        }
      }
    }
    // Fallback: find the LAST occurrence in the doc and look ahead further
    let lastIdx = -1;
    for (let i = 0; i < items.length; i++) if (label.test(items[i])) lastIdx = i;
    if (lastIdx < 0) return 0;
    return findNextNumber(items, lastIdx + 1, 6);
  };
  const sectionA = sectionLine(/^A\.\s*General\s*Requirements/i);
  const sectionB = sectionLine(/^B\.\s*Supply\s*of\s*Components/i);
  const sectionC = sectionLine(/^C\.\s*Engineering\s*Services/i);

  // ── Terms (best-effort) ───────────────────────────────────────────────────
  let paymentTerms = '';
  const payIdx = findIndex(items, (t) => /^Payment\s*Terms:?$/i.test(t));
  if (payIdx >= 0) {
    // Collect the next 1-3 lines until we hit another known section header
    const slice = items.slice(payIdx + 1, payIdx + 8);
    paymentTerms = slice.filter((t) => !/^(Warranty|Validity|Delivery)/i.test(t))
      .slice(0, 3)
      .join(' ')
      .trim();
  }
  let deliveryTerms = '';
  const dlvIdx = findIndex(items, (t) => /^Delivery:?$/i.test(t));
  if (dlvIdx >= 0) {
    const slice = items.slice(dlvIdx + 1, dlvIdx + 6);
    deliveryTerms = slice.filter((t) => !/^(Warranty|Payment|Validity)/i.test(t))
      .slice(0, 2)
      .join(' ')
      .trim();
  }

  const authorizedBy = (rawText.match(/Authorized by:\s*[|\s]*([A-Z][a-zA-Z]+\s+[A-Z][a-zA-Z]+)/) || ['', ''])[1] ||
    'Renzel Punongbayan';

  return {
    refCode,
    baseCode,
    revision,
    kind,
    date,
    rawDate,
    validityDays,
    warrantyMonths,
    recipientName,
    recipientContact,
    recipientEmail,
    recipientAddress,
    projectName,
    paymentTerms,
    deliveryTerms,
    authorizedBy,
    vatMode,
    vatPct,
    subtotal,
    vat,
    grandTotal,
    sectionA,
    sectionB,
    sectionC,
    warnings,
    sourceFile: file.name,
    rawText,
  };
}
