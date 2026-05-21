// Legacy calcsheet parser — reads historical Excel calcsheets (PCS pattern) and
// produces a snapshot ready to import as `formulaVersion: 'legacy'` quotations.
//
// The parser is keyword-driven (not fixed cell positions) so it tolerates
// row-count variations across workbooks. The snapshot totals are read directly
// from the rendered IOCT / ACTI sheet cells — they are NOT recomputed.

import * as XLSX from 'xlsx';
import type {
  ComponentLine,
  GeneralReqLine,
  ManpowerEntry,
  QuotationTotals,
  ServiceLine,
} from '../../types/Quotation';

type WS = XLSX.WorkSheet;
type CellVal = string | number | boolean | Date | undefined;

export interface ParsedQuotation {
  kind: 'IOCT' | 'ACTI';
  revision: string;
  recipientCode: string;
  paymentTerms: string;
  deliveryTerms: string;
  validityDays: number;
  warrantyMonths: number;
  preparedBy: string;
  authorizedBy: string;
  productMarkupPct: number;
  laborMarkupPct: number;
  generalReqMarkupPct: number;
  globalContingencyPct: number;
  discountPct: number;
  vatPct: number;
  generalReqts: GeneralReqLine[];
  components: ComponentLine[];
  services: ServiceLine[];
  manpower: ManpowerEntry[];
  servicesFromManpower: boolean;
  legacyTotalsSnapshot: QuotationTotals;
}

export interface ParsedClient {
  code: string;
  name: string;
  contact: string;
  email?: string;
  phone?: string;
  address?: string;
  gender?: 'M' | 'F' | '';
  paymentTerms?: string;
}

export interface ParsedProject {
  originalCode: string;       // e.g. PCS2602001-ICI-00 (from filename / General Info)
  baseCode: string;           // PCS2602001-ICI (strip -REV)
  yymm: string;               // e.g. 2602
  seqFromOriginal: number;    // sequence portion of the original code, when parseable
  clientCode: string;         // e.g. ICI
  revision: string;           // e.g. 00
  projectName: string;
  date: string;               // ISO date string
  customer: ParsedClient;
  quotations: ParsedQuotation[];
  warnings: string[];
  sourceFile: string;
  pdfFilename?: string;
  offerPdfs: string[];        // PDFs found in the sibling /Offer/ folder, if folder picker was used
  projectFolder?: string;     // top-level project folder name, when known
}

// ── small helpers ─────────────────────────────────────────────────────────────

const cell = (ws: WS, r: number, c: number): CellVal => {
  const k = XLSX.utils.encode_cell({ r, c });
  return ws[k]?.v as CellVal;
};
const text = (v: CellVal): string => (v == null ? '' : String(v).trim());
const num = (v: CellVal): number => {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const range = (ws: WS) => XLSX.utils.decode_range(ws['!ref'] ?? 'A1');

// Find the row index where any cell in cols A-C matches one of the labels (case-insensitive).
function findRow(ws: WS, labels: string[], colMax = 4): number {
  const r = range(ws);
  const want = labels.map((s) => s.toLowerCase().trim());
  for (let row = 0; row <= r.e.r; row++) {
    for (let col = 0; col <= Math.min(colMax, r.e.c); col++) {
      const v = text(cell(ws, row, col)).toLowerCase();
      if (v && want.some((w) => v === w || v.startsWith(w))) return row;
    }
  }
  return -1;
}

// Read the value to the right of a label cell, scanning a few columns forward.
function valueRightOf(ws: WS, row: number, startCol = 1, maxCols = 8): CellVal {
  for (let c = startCol; c <= startCol + maxCols; c++) {
    const v = cell(ws, row, c);
    if (v != null && String(v).trim() !== '') return v;
  }
  return undefined;
}

function findLabeledRow(ws: WS, label: string): number {
  return findRow(ws, [label]);
}

function readByLabel(ws: WS, label: string): CellVal {
  const r = findLabeledRow(ws, label);
  if (r < 0) return undefined;
  return valueRightOf(ws, r);
}

// Convert Excel serial date (used in General Info R4) to JS Date.
function excelDateToISO(v: CellVal): string {
  if (v == null) return new Date().toISOString().slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    // Excel epoch: 1899-12-30
    const ms = (v - 25569) * 86400 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

function id(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── General Info parser ───────────────────────────────────────────────────────

function parseGeneralInfo(ws: WS, warnings: string[]) {
  const date = excelDateToISO(readByLabel(ws, 'Date:'));
  const refNo = text(readByLabel(ws, 'Quotation Reference No:'));
  const revision = text(readByLabel(ws, 'Revision No.')) || '00';
  const seq = num(readByLabel(ws, 'Quotation No.'));
  const yy = text(readByLabel(ws, 'Year:'));
  const mm = text(readByLabel(ws, 'Month:'));
  const clientCode = text(readByLabel(ws, 'Client Code.:'));
  const projectName = text(readByLabel(ws, 'Project Name:'));
  const clientName = text(readByLabel(ws, 'Client:'));
  const location = text(readByLabel(ws, 'Location:'));
  const contact = text(readByLabel(ws, 'Contact Person:'));
  const position = text(readByLabel(ws, 'Position:'));
  const emailOrPhone = text(readByLabel(ws, 'Contact Number / email add:'));
  const genderRaw = text(readByLabel(ws, 'Gender:')).toUpperCase();
  const gender: 'M' | 'F' | '' = genderRaw === 'M' ? 'M' : genderRaw === 'F' ? 'F' : '';
  const preparedBy = text(readByLabel(ws, 'Commercially Prepared By:'));
  const paymentTerms = text(readByLabel(ws, 'Payment Terms:'));
  const validityRaw = text(readByLabel(ws, 'Validity:'));
  const validityDays = parseInt(validityRaw, 10) || 30;

  const deliveryRaw = text(readByLabel(ws, 'Delivery Leadtime:'));
  const deliveryUnitRow = findLabeledRow(ws, 'Delivery Leadtime:');
  const deliveryUnit = deliveryUnitRow >= 0 ? text(cell(ws, deliveryUnitRow, 4)) : 'weeks';
  const deliveryTerms = deliveryRaw
    ? `Delivery is ${deliveryRaw} ${deliveryUnit || 'weeks'}, upon receipt of a technically and commercially clarified purchase order.`
    : 'Delivery is 1-2 weeks, upon receipt of a technically and commercially clarified purchase order.';

  if (!refNo) warnings.push('General Info: Quotation Reference No is blank');
  if (!projectName) warnings.push('General Info: Project Name is blank');
  if (!clientCode) warnings.push('General Info: Client Code is blank');

  const yymm = yy && mm ? `${yy.padStart(2, '0')}${mm.padStart(2, '0')}` : '';

  return {
    refNo,
    revision,
    seq,
    yymm,
    date,
    clientCode,
    projectName,
    clientName,
    location,
    contact,
    position,
    emailOrPhone,
    gender,
    preparedBy,
    paymentTerms,
    validityDays,
    deliveryTerms,
  };
}

// ── Quotation sheet parser (IOCT / ACTI) ──────────────────────────────────────
// Both sheets share the layout:
//   - "General Requirements" section header
//   - Header row (Item No. | Description | _ | QTY | UOM | Unit Price | Total , PHP)
//   - A-XXXX rows
//   - "sub total (vat-ex)" row
//   - "Supply of Components" header
//   - B-XXXX rows
//   - "Engineering Services" header
//   - C-XXXX rows
//   - "Summary" block (totals)
//
// Column layout: A=code, B=description, D=qty, E=uom, F=unit price, G=total

function parseQuotationSheet(
  ws: WS,
  kind: 'IOCT' | 'ACTI',
  warnings: string[],
): {
  generalReqts: GeneralReqLine[];
  components: ComponentLine[];
  services: ServiceLine[];
  totals: QuotationTotals;
  recipientName: string;
  recipientCode: string;
} {
  const r = range(ws);

  const rowA = findRow(ws, ['general requirements', 'a.general requirements', 'a.general req'], 2);
  const rowB = findRow(ws, ['supply of components', 'b.supply of components', 'b.supply'], 2);
  const rowC = findRow(ws, ['engineering services', 'c.engineering services', 'c.engineering'], 2);
  const rowSummary = findRow(ws, ['summary'], 2);

  if (rowA < 0) warnings.push(`${kind} sheet: missing 'General Requirements' section`);
  if (rowB < 0) warnings.push(`${kind} sheet: missing 'Supply of Components' section`);
  if (rowC < 0) warnings.push(`${kind} sheet: missing 'Engineering Services' section`);

  // helper: read item rows in a band [headerRow+2 .. endRow-1] looking for a "*-NNNN" code prefix.
  const readBand = (startRow: number, endRow: number, prefix: 'A' | 'B' | 'C') => {
    const rows: Array<{ code: string; description: string; qty: number; uom: string; unitPrice: number; total: number }> = [];
    for (let row = startRow; row < endRow && row <= r.e.r; row++) {
      const code = text(cell(ws, row, 0));
      if (!code || !code.startsWith(`${prefix}-`)) continue;
      const rawDesc = text(cell(ws, row, 1));
      // Template ghost rows often carry literal '0' (or '-') in description and zeros in qty/price.
      const description = rawDesc === '0' || rawDesc === '-' ? '' : rawDesc;
      const qty = num(cell(ws, row, 3));
      const uom = text(cell(ws, row, 4));
      const unitPrice = num(cell(ws, row, 5));
      const total = num(cell(ws, row, 6));
      // Skip ghost rows: empty description AND zero amounts everywhere.
      if (!description && qty === 0 && unitPrice === 0 && total === 0) continue;
      rows.push({ code, description, qty, uom, unitPrice, total });
    }
    return rows;
  };

  // Boundaries
  const endA = rowB > 0 ? rowB : (rowC > 0 ? rowC : r.e.r);
  const endB = rowC > 0 ? rowC : (rowSummary > 0 ? rowSummary : r.e.r);
  const endC = rowSummary > 0 ? rowSummary : r.e.r;

  const aRows = rowA >= 0 ? readBand(rowA + 1, endA, 'A') : [];
  const bRows = rowB >= 0 ? readBand(rowB + 1, endB, 'B') : [];
  const cRows = rowC >= 0 ? readBand(rowC + 1, endC, 'C') : [];

  const generalReqts: GeneralReqLine[] = aRows.map((row) => ({
    id: id(),
    code: row.code,
    description: row.description,
    unitPrice: row.unitPrice,
    qty: row.qty || 1,
    uom: row.uom || 'lot',
  }));

  // For legacy quotations, components are flat (we don't know forex/contingency split — store unit price as unitCost).
  const components: ComponentLine[] = bRows.map((row) => ({
    id: id(),
    code: row.code,
    description: row.description,
    brand: '',
    partNo: '',
    qty: row.qty || 1,
    uom: row.uom || 'pc',
    unitCost: row.unitPrice,
    forex: 1,
    contingencyPct: 0,
    discountPct: 0,
  }));

  // Services are typically a single LOT line on legacy quotations; preserve all rows that have a description.
  const services: ServiceLine[] = cRows.map((row) => ({
    id: id(),
    code: row.code,
    description: row.description,
    amount: row.total || row.unitPrice || 0,
  }));

  // Totals snapshot — read from the Summary block.
  const totals = readSummaryTotals(ws, rowSummary >= 0 ? rowSummary : 0, warnings, kind);

  // Recipient block (rows 6-9 in PCS pattern: name, contact, email, address)
  const recipientName = text(cell(ws, 5, 0));   // R6 col A
  // For IOCT sheet: recipient = ACTI; for ACTI sheet: recipient = customer
  const recipientCode = ''; // resolved later by client matching

  return { generalReqts, components, services, totals, recipientName, recipientCode };
}

function readSummaryTotals(
  ws: WS,
  summaryRow: number,
  warnings: string[],
  kind: 'IOCT' | 'ACTI',
): QuotationTotals {
  // Walk down from summaryRow looking for known label rows.
  const r = range(ws);
  let generalReqtsSubtotal = 0;
  let componentsSubtotal = 0;
  let servicesSubtotal = 0;
  let subtotal = 0;
  let discount = 0;
  let vat = 0;
  let grandTotal = 0;

  for (let row = summaryRow; row < Math.min(summaryRow + 30, r.e.r); row++) {
    const labelA = text(cell(ws, row, 0)).toLowerCase();
    const labelF = text(cell(ws, row, 5)).toLowerCase();
    const valF = num(cell(ws, row, 5));
    const valG = num(cell(ws, row, 6));

    if (labelA.includes('general req')) generalReqtsSubtotal = valF;
    else if (labelA.includes('supply of components') || labelA.includes('b.supply')) componentsSubtotal = valF;
    else if (labelA.includes('engineering services') || labelA.includes('c.engineering')) servicesSubtotal = valF;

    // "TOTAL PRICE, PHP (VAT-EX/IN)" can land with the label in col A OR col F
    // depending on the sheet's merged-cell layout. The IOCT sheet on some
    // workbooks puts the label in col A, while ACTI puts it in col F. Check
    // both columns and prefer the total-price interpretation over the bare
    // "vat" match below (which would otherwise capture the row's value as the
    // VAT amount).
    const labelEither = `${labelA} ${labelF}`;
    if (labelEither.includes('total price')) {
      if (labelEither.includes('vat-ex')) subtotal = valG;
      else if (labelEither.includes('vat-in')) grandTotal = valG;
    } else if (labelEither.includes('discount') && !labelEither.includes('discounted')) {
      discount = valG;
    } else if (
      // Plain "12% VAT" row — must NOT match "vat-ex" or "vat-in" in either column.
      (labelF.includes('vat') && !labelF.includes('vat-ex') && !labelF.includes('vat-in')) ||
      (labelA.includes('vat') && !labelA.includes('vat-ex') && !labelA.includes('vat-in'))
    ) {
      vat = valG;
    }
  }

  if (!subtotal && (generalReqtsSubtotal || componentsSubtotal || servicesSubtotal)) {
    subtotal = generalReqtsSubtotal + componentsSubtotal + servicesSubtotal;
  }
  if (!grandTotal) {
    grandTotal = Math.max(0, subtotal - discount) + vat;
  }

  if (subtotal === 0 && grandTotal === 0) {
    warnings.push(`${kind} sheet: could not read Summary totals (all zero)`);
  }

  return {
    generalReqtsCost: generalReqtsSubtotal,
    generalReqtsWithContingency: generalReqtsSubtotal,
    generalReqtsSubtotal,
    componentsCost: componentsSubtotal,
    componentsSubtotal,
    laborCost: servicesSubtotal,
    laborWithContingency: servicesSubtotal,
    servicesSubtotal,
    subtotal,
    discount,
    vat,
    grandTotal,
  };
}

// ── Manpower parser (Labor and Gen Reqt sheet, right-hand block) ──────────────
// The right block carries the per-role details: cols G-P contain
//   role | _ | Manpower Qty | Mandays | Sub-Total | Daily Rate | Allowance | Contingency | Unit Price | Sub-Total
// Engineering rows start ~R20, labor rows start ~R29. We scan the whole sheet.

function parseManpower(ws: WS): ManpowerEntry[] {
  const r = range(ws);
  const out: ManpowerEntry[] = [];

  const engineeringRoles = new Set([
    'plc engineer - offsite',
    'plc engineer - onsite',
    'hmi engineer - offsite',
    'hmi engineer - onsite',
    'project manager',
  ]);
  const laborRoles = new Set([
    'foreman', 'technician', 'electrician', 'safety officer',
    'autocad operator', 'welder', 'scaffolder', 'helper', 'driver', 'document controller',
  ]);

  for (let row = 0; row <= r.e.r; row++) {
    const roleCell = text(cell(ws, row, 6)).toLowerCase(); // col G
    if (!roleCell) continue;
    const isEng = engineeringRoles.has(roleCell);
    const isLabor = laborRoles.has(roleCell);
    if (!isEng && !isLabor) continue;

    const headcount = num(cell(ws, row, 8));   // col I
    const mandays = num(cell(ws, row, 9));     // col J
    const dailyRate = num(cell(ws, row, 11));  // col L
    const allowance = num(cell(ws, row, 12));  // col M
    // skip roles with zero count and zero mandays
    if (headcount === 0 && mandays === 0) continue;

    out.push({
      id: id(),
      role: text(cell(ws, row, 6)),
      group: isEng ? 'engineering' : 'labor',
      headcount,
      mandays,
      dailyRate,
      allowance,
      presetId: null,
    });
  }
  return out;
}

// Read the global margin & contingency from R2 / R3 col B of "Labor and Gen Reqt"
function parseMarkupBasis(ws: WS): { laborMarkupPct: number; globalContingencyPct: number } {
  const margin = num(cell(ws, 1, 1));        // R2 col B
  const contingency = num(cell(ws, 2, 1));   // R3 col B
  return {
    laborMarkupPct: margin > 0 && margin <= 1 ? margin * 100 : margin,
    globalContingencyPct: contingency > 0 && contingency <= 1 ? contingency * 100 : contingency,
  };
}

// ── Top-level entry point ─────────────────────────────────────────────────────

export interface ParseLegacyOptions {
  filename: string;
  pdfFilename?: string;
  offerPdfs?: string[];
  projectFolder?: string;
}

export function parseLegacyWorkbook(buf: ArrayBuffer | Uint8Array, opts: ParseLegacyOptions): ParsedProject {
  const wb = XLSX.read(buf, { type: 'array', cellFormula: false, cellStyles: false });
  const warnings: string[] = [];

  // Validate sheets
  const required = ['General Info', 'IOCT', 'ACTI', 'Labor and Gen Reqt'];
  const missing = required.filter((s) => !wb.SheetNames.includes(s));
  if (missing.length) warnings.push(`Missing sheets: ${missing.join(', ')}`);

  const gi = wb.Sheets['General Info'];
  const ioctWs = wb.Sheets['IOCT'];
  const actiWs = wb.Sheets['ACTI'];
  const laborWs = wb.Sheets['Labor and Gen Reqt'];

  const info = gi ? parseGeneralInfo(gi, warnings) : {
    refNo: '', revision: '00', seq: 0, yymm: '', date: new Date().toISOString().slice(0, 10),
    clientCode: '', projectName: '', clientName: '', location: '', contact: '', position: '',
    emailOrPhone: '', gender: '' as const, preparedBy: '', paymentTerms: '', validityDays: 30,
    deliveryTerms: '',
  };

  const { laborMarkupPct, globalContingencyPct } = laborWs
    ? parseMarkupBasis(laborWs)
    : { laborMarkupPct: 30, globalContingencyPct: 10 };

  const manpower = laborWs ? parseManpower(laborWs) : [];

  // Derive code parts from filename if General Info refNo is blank.
  const filenameBase = opts.filename.replace(/\.xlsx?\s*$/i, '');
  const refNo = (info.refNo && !/^PCS\d{4}-?0-/.test(info.refNo)) ? info.refNo : filenameBase;
  const codeMatch = refNo.match(/^PCS(\d{2})(\d{2})(\d{3})-([A-Z]{3})-(\d{2})$/);
  let yymm = info.yymm;
  let seqFromOriginal = info.seq;
  let clientCode = info.clientCode;
  let revision = info.revision;
  let projectName = info.projectName;

  if (codeMatch) {
    yymm = `${codeMatch[1]}${codeMatch[2]}`;
    seqFromOriginal = parseInt(codeMatch[3], 10);
    clientCode = clientCode || codeMatch[4];
    revision = revision || codeMatch[5];
  }

  // Folder-name fallback: when General Info was left blank or its reference number is broken,
  // recover yymm/seq/client/projectName from the project folder name, e.g.
  //   "PCS2602005-ADI B1P1 RH and Temp Calibration" → code=PCS2602005, client=ADI, name="B1P1 RH..."
  //   "PCS2605031 - ISTS BMS Roughing ins_"        → code=PCS2605031, client=IST, name="BMS Roughing..."
  //
  // When `codeMatch` failed (the General Info reference is corrupted), we treat the folder name
  // as AUTHORITATIVE because the parsed-from-General-Info values are unreliable.
  if (opts.projectFolder) {
    const fm = opts.projectFolder.match(/^PCS(\d{2})(\d{2})(\d{3})\s*-\s*([A-Z&]{2,4})\s+(.+?)\s*$/);
    if (fm) {
      const folderAuthoritative = !codeMatch; // refNo is not a valid PCS code → trust the folder
      yymm = (folderAuthoritative || !yymm) ? `${fm[1]}${fm[2]}` : yymm;
      if (folderAuthoritative || !seqFromOriginal) seqFromOriginal = parseInt(fm[3], 10);
      if (folderAuthoritative || !clientCode || clientCode === '0') clientCode = fm[4].slice(0, 3);
      if (!projectName) projectName = fm[5].trim();
    }
  }

  // Filename fallback for sequence number (when General Info Quotation No. was blank).
  if (!seqFromOriginal) {
    const fn = filenameBase.match(/^PCS\d{4}(\d{3})/);
    if (fn) seqFromOriginal = parseInt(fn[1], 10);
  }

  if (!yymm || !seqFromOriginal) {
    warnings.push(`Could not extract YYMM/sequence from reference '${refNo}' / folder '${opts.projectFolder || ''}' (will need manual code assignment)`);
  }

  const baseCode = clientCode && yymm
    ? `PCS${yymm}${String(seqFromOriginal).padStart(3, '0')}-${clientCode}`
    : filenameBase.replace(/-\d{2}$/, '');

  const parseOne = (ws: WS | undefined, kind: 'IOCT' | 'ACTI'): ParsedQuotation | null => {
    if (!ws) {
      warnings.push(`${kind} sheet missing — skipping ${kind} quotation`);
      return null;
    }
    const parsed = parseQuotationSheet(ws, kind, warnings);
    // Derive discount % and vat % from the snapshot when possible.
    const discountPct = parsed.totals.subtotal > 0
      ? Math.round((parsed.totals.discount / parsed.totals.subtotal) * 10000) / 100
      : 0;
    const afterDisc = parsed.totals.subtotal - parsed.totals.discount;
    const vatPct = afterDisc > 0
      ? Math.round((parsed.totals.vat / afterDisc) * 10000) / 100
      : 0;
    return {
      kind,
      revision,
      recipientCode: '',
      paymentTerms: info.paymentTerms || '30% DP, 70% Progress Billing',
      deliveryTerms: info.deliveryTerms,
      validityDays: info.validityDays,
      warrantyMonths: 12,
      preparedBy: info.preparedBy,
      authorizedBy: info.preparedBy || 'Renzel Punongbayan',
      productMarkupPct: 30,
      laborMarkupPct,
      generalReqMarkupPct: 0,
      globalContingencyPct,
      discountPct,
      vatPct,
      generalReqts: parsed.generalReqts,
      components: parsed.components,
      services: parsed.services,
      manpower,
      servicesFromManpower: parsed.services.length <= 1 && manpower.length > 0,
      legacyTotalsSnapshot: parsed.totals,
    };
  };

  const quotations: ParsedQuotation[] = [];
  const ioctQ = parseOne(ioctWs, 'IOCT');
  if (ioctQ) quotations.push(ioctQ);
  const actiQ = parseOne(actiWs, 'ACTI');
  if (actiQ) quotations.push(actiQ);

  const customer: ParsedClient = {
    code: clientCode || 'XXX',
    name: info.clientName,
    contact: info.contact,
    email: info.emailOrPhone.includes('@') ? info.emailOrPhone : undefined,
    phone: info.emailOrPhone.includes('@') ? undefined : info.emailOrPhone,
    address: info.location,
    gender: info.gender,
    paymentTerms: info.paymentTerms,
  };

  return {
    originalCode: refNo,
    baseCode,
    yymm,
    seqFromOriginal,
    clientCode: clientCode || 'XXX',
    revision,
    projectName,
    date: info.date,
    customer,
    quotations,
    warnings,
    sourceFile: opts.filename,
    pdfFilename: opts.pdfFilename,
    offerPdfs: opts.offerPdfs ?? [],
    projectFolder: opts.projectFolder,
  };
}
