/**
 * Phase 1 smoke-test for the legacy calcsheet parser.
 *
 * Usage:
 *   node scripts/parse-legacy-calcsheet.js <path-to-xlsx>
 *
 * Dumps the parsed ParsedProject as JSON. Mirrors the logic in
 * src/utils/calcsheet/legacyImport.ts. (Plain JS duplicate because the project
 * does not currently ship a TS runtime for scripts.)
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/parse-legacy-calcsheet.js <path-to-xlsx>');
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error(`File not found: ${file}`);
  process.exit(1);
}

// ── helpers ──────────────────────────────────────────────────────────────────
const cellAt = (ws, r, c) => {
  const k = XLSX.utils.encode_cell({ r, c });
  return ws[k]?.v;
};
const text = (v) => (v == null ? '' : String(v).trim());
const num = (v) => {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const rangeOf = (ws) => XLSX.utils.decode_range(ws['!ref'] || 'A1');

function findRow(ws, labels, colMax = 4) {
  const r = rangeOf(ws);
  const want = labels.map((s) => s.toLowerCase().trim());
  for (let row = 0; row <= r.e.r; row++) {
    for (let col = 0; col <= Math.min(colMax, r.e.c); col++) {
      const v = text(cellAt(ws, row, col)).toLowerCase();
      if (v && want.some((w) => v === w || v.startsWith(w))) return row;
    }
  }
  return -1;
}

function valueRightOf(ws, row, startCol = 1, maxCols = 8) {
  for (let c = startCol; c <= startCol + maxCols; c++) {
    const v = cellAt(ws, row, c);
    if (v != null && String(v).trim() !== '') return v;
  }
  return undefined;
}

function readByLabel(ws, label) {
  const r = findRow(ws, [label]);
  if (r < 0) return undefined;
  return valueRightOf(ws, r);
}

function excelDateToISO(v) {
  if (v == null) return new Date().toISOString().slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const ms = (v - 25569) * 86400 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

const id = () => Math.random().toString(36).slice(2, 10);

// ── General Info ─────────────────────────────────────────────────────────────
function parseGeneralInfo(ws, warnings) {
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
  const gender = genderRaw === 'M' ? 'M' : genderRaw === 'F' ? 'F' : '';
  const preparedBy = text(readByLabel(ws, 'Commercially Prepared By:'));
  const paymentTerms = text(readByLabel(ws, 'Payment Terms:'));
  const validityRaw = text(readByLabel(ws, 'Validity:'));
  const validityDays = parseInt(validityRaw, 10) || 30;
  const deliveryRaw = text(readByLabel(ws, 'Delivery Leadtime:'));
  const deliveryUnitRow = findRow(ws, ['Delivery Leadtime:']);
  const deliveryUnit = deliveryUnitRow >= 0 ? text(cellAt(ws, deliveryUnitRow, 4)) : 'weeks';
  const deliveryTerms = deliveryRaw
    ? `Delivery is ${deliveryRaw} ${deliveryUnit || 'weeks'}, upon receipt of a technically and commercially clarified purchase order.`
    : 'Delivery is 1-2 weeks, upon receipt of a technically and commercially clarified purchase order.';

  if (!refNo) warnings.push('General Info: Quotation Reference No is blank');
  if (!projectName) warnings.push('General Info: Project Name is blank');
  if (!clientCode) warnings.push('General Info: Client Code is blank');

  const yymm = yy && mm ? `${String(yy).padStart(2, '0')}${String(mm).padStart(2, '0')}` : '';

  return {
    refNo, revision, seq, yymm, date, clientCode, projectName, clientName,
    location, contact, position, emailOrPhone, gender, preparedBy, paymentTerms,
    validityDays, deliveryTerms,
  };
}

// ── Quotation sheet ──────────────────────────────────────────────────────────
function parseQuotationSheet(ws, kind, warnings) {
  const r = rangeOf(ws);
  const rowA = findRow(ws, ['general requirements', 'a.general requirements', 'a.general req'], 2);
  const rowB = findRow(ws, ['supply of components', 'b.supply of components', 'b.supply'], 2);
  const rowC = findRow(ws, ['engineering services', 'c.engineering services', 'c.engineering'], 2);
  const rowSummary = findRow(ws, ['summary'], 2);

  if (rowA < 0) warnings.push(`${kind} sheet: missing 'General Requirements' section`);
  if (rowB < 0) warnings.push(`${kind} sheet: missing 'Supply of Components' section`);
  if (rowC < 0) warnings.push(`${kind} sheet: missing 'Engineering Services' section`);

  const readBand = (startRow, endRow, prefix) => {
    const rows = [];
    for (let row = startRow; row < endRow && row <= r.e.r; row++) {
      const code = text(cellAt(ws, row, 0));
      if (!code || !code.startsWith(`${prefix}-`)) continue;
      const rawDesc = text(cellAt(ws, row, 1));
      const description = rawDesc === '0' || rawDesc === '-' ? '' : rawDesc;
      const qty = num(cellAt(ws, row, 3));
      const uom = text(cellAt(ws, row, 4));
      const unitPrice = num(cellAt(ws, row, 5));
      const total = num(cellAt(ws, row, 6));
      if (!description && qty === 0 && unitPrice === 0 && total === 0) continue;
      rows.push({ code, description, qty, uom, unitPrice, total });
    }
    return rows;
  };

  const endA = rowB > 0 ? rowB : (rowC > 0 ? rowC : r.e.r);
  const endB = rowC > 0 ? rowC : (rowSummary > 0 ? rowSummary : r.e.r);
  const endC = rowSummary > 0 ? rowSummary : r.e.r;
  const aRows = rowA >= 0 ? readBand(rowA + 1, endA, 'A') : [];
  const bRows = rowB >= 0 ? readBand(rowB + 1, endB, 'B') : [];
  const cRows = rowC >= 0 ? readBand(rowC + 1, endC, 'C') : [];

  const generalReqts = aRows.map((row) => ({
    id: id(), code: row.code, description: row.description, unitPrice: row.unitPrice,
    qty: row.qty || 1, uom: row.uom || 'lot',
  }));
  const components = bRows.map((row) => ({
    id: id(), code: row.code, description: row.description, brand: '', partNo: '',
    qty: row.qty || 1, uom: row.uom || 'pc', unitCost: row.unitPrice, forex: 1,
    contingencyPct: 0, discountPct: 0,
  }));
  const services = cRows.map((row) => ({
    id: id(), code: row.code, description: row.description, amount: row.total || row.unitPrice || 0,
  }));

  // Totals — scan summary block.
  let generalReqtsSubtotal = 0, componentsSubtotal = 0, servicesSubtotal = 0;
  let subtotal = 0, discount = 0, vat = 0, grandTotal = 0;
  const summaryStart = rowSummary >= 0 ? rowSummary : 0;
  for (let row = summaryStart; row < Math.min(summaryStart + 30, r.e.r); row++) {
    const labelA = text(cellAt(ws, row, 0)).toLowerCase();
    const labelF = text(cellAt(ws, row, 5)).toLowerCase();
    const valF = num(cellAt(ws, row, 5));
    const valG = num(cellAt(ws, row, 6));
    if (labelA.includes('general req')) generalReqtsSubtotal = valF;
    else if (labelA.includes('supply of components') || labelA.includes('b.supply')) componentsSubtotal = valF;
    else if (labelA.includes('engineering services') || labelA.includes('c.engineering')) servicesSubtotal = valF;
    if (labelF.includes('total price')) {
      if (labelF.includes('vat-ex')) subtotal = valG;
      else if (labelF.includes('vat-in')) grandTotal = valG;
    } else if (labelF.includes('discount') && !labelF.includes('discounted')) {
      discount = valG;
    } else if (
      (labelF.includes('vat') && !labelF.includes('vat-ex') && !labelF.includes('vat-in')) ||
      labelA.includes('vat')
    ) {
      vat = valG;
    }
  }
  if (!subtotal && (generalReqtsSubtotal || componentsSubtotal || servicesSubtotal)) {
    subtotal = generalReqtsSubtotal + componentsSubtotal + servicesSubtotal;
  }
  if (!grandTotal) grandTotal = Math.max(0, subtotal - discount) + vat;
  if (subtotal === 0 && grandTotal === 0) warnings.push(`${kind} sheet: could not read Summary totals`);

  const totals = {
    generalReqtsCost: generalReqtsSubtotal, generalReqtsWithContingency: generalReqtsSubtotal,
    generalReqtsSubtotal, componentsCost: componentsSubtotal, componentsSubtotal,
    laborCost: servicesSubtotal, laborWithContingency: servicesSubtotal, servicesSubtotal,
    subtotal, discount, vat, grandTotal,
  };
  const recipientName = text(cellAt(ws, 5, 0));

  return { generalReqts, components, services, totals, recipientName };
}

// ── Manpower ─────────────────────────────────────────────────────────────────
const ENG_ROLES = new Set([
  'plc engineer - offsite', 'plc engineer - onsite',
  'hmi engineer - offsite', 'hmi engineer - onsite', 'project manager',
]);
const LABOR_ROLES = new Set([
  'foreman', 'technician', 'electrician', 'safety officer',
  'autocad operator', 'welder', 'scaffolder', 'helper', 'driver', 'document controller',
]);

function parseManpower(ws) {
  const r = rangeOf(ws);
  const out = [];
  for (let row = 0; row <= r.e.r; row++) {
    const roleCell = text(cellAt(ws, row, 6)).toLowerCase();
    if (!roleCell) continue;
    const isEng = ENG_ROLES.has(roleCell);
    const isLabor = LABOR_ROLES.has(roleCell);
    if (!isEng && !isLabor) continue;
    const headcount = num(cellAt(ws, row, 8));
    const mandays = num(cellAt(ws, row, 9));
    const dailyRate = num(cellAt(ws, row, 11));
    const allowance = num(cellAt(ws, row, 12));
    if (headcount === 0 && mandays === 0) continue;
    out.push({
      id: id(), role: text(cellAt(ws, row, 6)), group: isEng ? 'engineering' : 'labor',
      headcount, mandays, dailyRate, allowance, presetId: null,
    });
  }
  return out;
}

function parseMarkupBasis(ws) {
  const margin = num(cellAt(ws, 1, 1));
  const contingency = num(cellAt(ws, 2, 1));
  return {
    laborMarkupPct: margin > 0 && margin <= 1 ? margin * 100 : margin,
    globalContingencyPct: contingency > 0 && contingency <= 1 ? contingency * 100 : contingency,
  };
}

// ── ACTI variant parser (no IOCT/ACTI tabs — uses "Offer - Detailed" sheet) ───
// The ACTI-format workbooks have a totally different layout:
//   - Different General Info field labels (no Year/Month/ClientCode/Gender as separate fields)
//   - Single "Offer - Detailed" sheet (no IOCT/ACTI duplication)
//   - Item prefixes are P- (components) and S- (services), not B-/C-
//   - General Reqts roll up to a single summary line at the top of the offer sheet
function parseACTIVariant(wb, warnings, filename, projectFolderName) {
  const gi = wb.Sheets['General Info'];
  const offerWs = wb.Sheets['Offer - Detailed'];
  if (!offerWs) {
    warnings.push("Missing 'Offer - Detailed' sheet");
    return null;
  }

  // ─── General Info (ACTI schema) ─────────────────────────────────────────────
  const date = excelDateToISO(readByLabel(gi, 'Date:'));
  const refNo = text(readByLabel(gi, 'Quotation Reference No:'));
  const revision = text(readByLabel(gi, 'Revision No.')) || '00';
  const clientName = text(readByLabel(gi, 'Client:'));
  const projectName = text(readByLabel(gi, 'Project Name:'));
  const location = text(readByLabel(gi, 'Location:'));
  const contact = text(readByLabel(gi, 'Contact Person:'));
  const position = text(readByLabel(gi, 'Position'));
  const emailOrPhone = text(readByLabel(gi, 'Contact Number / email add'));
  const preparedBy = text(readByLabel(gi, 'Commercially Prepared By:'));
  const paymentTerms = text(readByLabel(gi, 'Payment Terms:'));
  const validityRaw = text(readByLabel(gi, 'Validity:'));
  const validityDays = parseInt(validityRaw, 10) || 30;
  const deliveryRaw = text(readByLabel(gi, 'Delivery Leadtime:'));
  const deliveryTerms = deliveryRaw
    ? `Delivery is ${deliveryRaw}, upon receipt of a technically and commercially clarified purchase order.`
    : 'Delivery is 1-2 weeks, upon receipt of a technically and commercially clarified purchase order.';

  // ─── Offer - Detailed: parse summary totals + component/service breakdowns ──
  const r = rangeOf(offerWs);

  // Summary: scan for the labels "Supply of Components", "Engineering Services", "General Requirements" in col A
  // and "TOTAL PRICE, PHP (VAT-EX)", "12% VAT", "TOTAL PRICE, PHP (VAT-IN)" in col A too.
  let componentsSubtotal = 0, servicesSubtotal = 0, generalReqtsSubtotal = 0;
  let subtotal = 0, vat = 0, grandTotal = 0;
  for (let row = 0; row <= Math.min(40, r.e.r); row++) {
    const labelA = text(cellAt(offerWs, row, 0)).toLowerCase();
    const valE = num(cellAt(offerWs, row, 4));
    const valF = num(cellAt(offerWs, row, 5));
    if (labelA.startsWith('supply of components')) componentsSubtotal = valF || valE;
    else if (labelA.startsWith('engineering services')) servicesSubtotal = valF || valE;
    else if (labelA.startsWith('general requirements')) generalReqtsSubtotal = valF || valE;
    else if (labelA.includes('total price') && labelA.includes('vat-ex')) subtotal = valF || valE;
    else if (labelA.includes('vat') && !labelA.includes('vat-ex') && !labelA.includes('vat-in')) vat = valF || valE;
    else if (labelA.includes('total price') && labelA.includes('vat-in')) grandTotal = valF || valE;
  }
  if (!subtotal) subtotal = componentsSubtotal + servicesSubtotal + generalReqtsSubtotal;
  if (!grandTotal) grandTotal = subtotal + vat;

  // Read P-XXXX (components) rows. They start after the "BREAKDOWN OF SYSTEM COMPONENTS" header.
  const components = [];
  for (let row = 0; row <= r.e.r; row++) {
    const code = text(cellAt(offerWs, row, 0));
    if (!/^P-\d{4}$/.test(code)) continue;
    const rawDesc = text(cellAt(offerWs, row, 1));
    const description = rawDesc === '0' || rawDesc === '-' ? '' : rawDesc;
    const qty = num(cellAt(offerWs, row, 3));
    const uom = text(cellAt(offerWs, row, 4));
    const unitPrice = num(cellAt(offerWs, row, 5));
    const total = num(cellAt(offerWs, row, 6));
    if (!description && qty === 0 && unitPrice === 0 && total === 0) continue;
    components.push({
      id: id(),
      code: 'B-' + code.slice(2),  // remap P-XXXX → B-XXXX to match data model
      description,
      brand: '', partNo: '',
      qty: qty || 1, uom: uom || 'pc',
      unitCost: unitPrice, forex: 1,
      contingencyPct: 0, discountPct: 0,
    });
  }

  // Read S-XXXX (services) rows
  const services = [];
  for (let row = 0; row <= r.e.r; row++) {
    const code = text(cellAt(offerWs, row, 0));
    if (!/^S-\d{4}$/.test(code)) continue;
    const rawDesc = text(cellAt(offerWs, row, 1));
    const description = rawDesc === '0' || rawDesc === '-' ? '' : rawDesc;
    const total = num(cellAt(offerWs, row, 6));
    const unitPrice = num(cellAt(offerWs, row, 5));
    if (!description && total === 0 && unitPrice === 0) continue;
    services.push({
      id: id(),
      code: 'C-' + code.slice(2),  // remap S-XXXX → C-XXXX
      description,
      amount: total || unitPrice || 0,
    });
  }

  // General Reqts: ACTI variant doesn't have a per-line breakdown in this sheet — just one summary.
  // Emit a single line so the subtotal is preserved in the data model.
  const generalReqts = generalReqtsSubtotal > 0 ? [{
    id: id(),
    code: 'A-0010',
    description: 'General Requirements (bundled — see source workbook for per-line breakdown)',
    unitPrice: generalReqtsSubtotal,
    qty: 1,
    uom: 'lot',
  }] : [];

  const totals = {
    generalReqtsCost: generalReqtsSubtotal, generalReqtsWithContingency: generalReqtsSubtotal,
    generalReqtsSubtotal, componentsCost: componentsSubtotal, componentsSubtotal,
    laborCost: servicesSubtotal, laborWithContingency: servicesSubtotal, servicesSubtotal,
    subtotal, discount: 0, vat, grandTotal,
  };

  if (subtotal === 0 && grandTotal === 0) {
    warnings.push('ACTI Offer - Detailed: could not read Summary totals');
  }

  return {
    info: {
      refNo, revision, projectName, clientName, location, contact, position, emailOrPhone,
      preparedBy, paymentTerms, validityDays, deliveryTerms, date,
    },
    quotation: {
      kind: 'ACTI',
      revision,
      paymentTerms: paymentTerms || '30% DP, 70% Progress Billing',
      deliveryTerms,
      validityDays,
      warrantyMonths: 12,
      preparedBy,
      authorizedBy: preparedBy || 'Tyrone James Caballero',
      productMarkupPct: 30,
      laborMarkupPct: 30,
      generalReqMarkupPct: 0,
      globalContingencyPct: 5,
      discountPct: 0,
      vatPct: subtotal > 0 ? Math.round((vat / subtotal) * 10000) / 100 : 12,
      generalReqts,
      components,
      services,
      manpower: [],
      servicesFromManpower: false,
      legacyTotalsSnapshot: totals,
    },
  };
}

// ── main ─────────────────────────────────────────────────────────────────────
const filename = path.basename(file);
const buf = fs.readFileSync(file);
const wb = XLSX.read(buf, { type: 'buffer', cellFormula: false, cellStyles: false });
const warnings = [];

// Detect variant: ACTI workbooks have "Offer - Detailed" but no IOCT/ACTI tabs.
const isACTIVariant = wb.SheetNames.includes('Offer - Detailed')
  && !wb.SheetNames.includes('IOCT')
  && !wb.SheetNames.includes('ACTI');

const projectFolder = path.basename(path.dirname(path.dirname(file)));

if (isACTIVariant) {
  // ─── ACTI variant path ──────────────────────────────────────────────────────
  const result = parseACTIVariant(wb, warnings, filename, projectFolder);
  if (!result) {
    console.error('ACTI parse failed — see warnings');
    console.log(JSON.stringify({ originalCode: filename, projectFolder, warnings, quotations: [] }, null, 2));
    process.exit(1);
  }
  // Folder name extraction (ACTI{YYMM}-{SEQ}-{TJC|RPP} ClientName ProjectDesc)
  // Examples:
  //   ACTI2512-01-TJC LBI Plaridel Expansion
  //   ACTI2512-02-RPP Additional Temperature & RH Integration -B1 PH2
  //   ACTI2511-01-TJC EBECOR LEAR MES Interface
  const fm = projectFolder.match(/^ACTI(\d{2})(\d{2})-(\d{2})-([A-Z]{3})\s+(.+?)\s*$/);
  const yymm = fm ? `${fm[1]}${fm[2]}` : '';
  const origSeq = fm ? parseInt(fm[3], 10) : 0;
  const salesCode = fm ? fm[4] : '';
  const projectNameFromFolder = fm ? fm[5] : '';

  // Best-effort client code inference from project name first token (e.g., "LBI Plaridel" → LBI, "EBECOR LEAR" → EBC, "Additional Temperature" → ADI based on facility "B1 PH2")
  // We'll let the caller (bulk-import) refine this via client-name lookup; here, try a simple heuristic.
  let clientCode = '';
  const name = (result.info.clientName || projectNameFromFolder || '').toLowerCase();
  if (/lbi/.test(name)) clientCode = 'LBI';
  else if (/ebec/.test(name) || /^ebecor/.test(name)) clientCode = 'EBC';
  else if (/analog/.test(name) || /b1\s*ph?\s*2/.test(name) || /b1\s*p\s*[12]/.test(name)) clientCode = 'ADI';
  else if (/innovative/.test(name) || /\bici\b/.test(name)) clientCode = 'ICI';
  else if (/tann/.test(name)) clientCode = 'TPI';
  else if (/ryonan|repco/.test(name)) clientCode = 'REP';
  else if (/belmont/.test(name)) clientCode = 'BLI';

  const customer = {
    code: clientCode || '',
    name: result.info.clientName || projectNameFromFolder || '',
    contact: result.info.contact,
    email: result.info.emailOrPhone.includes('@') ? result.info.emailOrPhone : undefined,
    phone: result.info.emailOrPhone.includes('@') ? undefined : result.info.emailOrPhone,
    address: result.info.location,
    gender: '',
    paymentTerms: result.info.paymentTerms,
  };

  const out = {
    originalCode: result.info.refNo || projectFolder,
    baseCode: '',                  // caller (bulk-import) assigns new PCS code
    yymm,                          // from folder
    seqFromOriginal: origSeq,      // from folder (not the PCS seq — caller will reassign)
    salesCode,                     // TJC / RPP — passed for audit
    clientCode,
    revision: '00',
    projectName: result.info.projectName || projectNameFromFolder,
    date: result.info.date,
    customer,
    quotations: [result.quotation],
    warnings,
    sourceFile: filename,
    projectFolder,
    variant: 'ACTI',
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

// ─── Original PCS variant path (existing logic below) ──────────────────────────
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
  emailOrPhone: '', gender: '', preparedBy: '', paymentTerms: '', validityDays: 30, deliveryTerms: '',
};

const basis = laborWs ? parseMarkupBasis(laborWs) : { laborMarkupPct: 30, globalContingencyPct: 10 };
const manpower = laborWs ? parseManpower(laborWs) : [];

// Derive code parts
const filenameBase = filename.replace(/\.xlsx?\s*$/i, '');
const refNo = (info.refNo && !/^PCS\d{4}-?0-/.test(info.refNo)) ? info.refNo : filenameBase;
const codeMatch = refNo.match(/^PCS(\d{2})(\d{2})(\d{3})-([A-Z]{3})-(\d{2})$/);
let yymm = info.yymm, seqFromOriginal = info.seq, clientCode = info.clientCode, revision = info.revision;
let projectName = info.projectName;
if (codeMatch) {
  yymm = `${codeMatch[1]}${codeMatch[2]}`;
  seqFromOriginal = parseInt(codeMatch[3], 10);
  clientCode = clientCode || codeMatch[4];
  revision = revision || codeMatch[5];
}

// Folder-name fallback when General Info was left blank or refNo is corrupted
// (projectFolder already declared above for ACTI variant detection — reuse it here)
if (projectFolder) {
  const fm = projectFolder.match(/^PCS(\d{2})(\d{2})(\d{3})\s*-\s*([A-Z&]{2,4})\s+(.+?)\s*$/);
  if (fm) {
    const folderAuthoritative = !codeMatch;
    yymm = (folderAuthoritative || !yymm) ? `${fm[1]}${fm[2]}` : yymm;
    if (folderAuthoritative || !seqFromOriginal) seqFromOriginal = parseInt(fm[3], 10);
    if (folderAuthoritative || !clientCode || clientCode === '0') clientCode = fm[4].slice(0, 3);
    if (!projectName) projectName = fm[5].trim();
  }
}

if (!seqFromOriginal) {
  const fn = filenameBase.match(/^PCS\d{4}(\d{3})/);
  if (fn) seqFromOriginal = parseInt(fn[1], 10);
}

if (!yymm || !seqFromOriginal) {
  warnings.push(`Could not extract YYMM/sequence from '${refNo}' / folder '${projectFolder}'`);
}

const baseCode = clientCode && yymm
  ? `PCS${yymm}${String(seqFromOriginal).padStart(3, '0')}-${clientCode}`
  : filenameBase.replace(/-\d{2}$/, '');

function parseOne(ws, kind) {
  if (!ws) { warnings.push(`${kind} sheet missing`); return null; }
  const parsed = parseQuotationSheet(ws, kind, warnings);
  const discountPct = parsed.totals.subtotal > 0
    ? Math.round((parsed.totals.discount / parsed.totals.subtotal) * 10000) / 100
    : 0;
  const afterDisc = parsed.totals.subtotal - parsed.totals.discount;
  const vatPct = afterDisc > 0 ? Math.round((parsed.totals.vat / afterDisc) * 10000) / 100 : 0;
  return {
    kind, revision, recipientCode: '',
    paymentTerms: info.paymentTerms || '30% DP, 70% Progress Billing',
    deliveryTerms: info.deliveryTerms, validityDays: info.validityDays, warrantyMonths: 12,
    preparedBy: info.preparedBy, authorizedBy: info.preparedBy || 'Renzel Punongbayan',
    productMarkupPct: 30, laborMarkupPct: basis.laborMarkupPct, generalReqMarkupPct: 0,
    globalContingencyPct: basis.globalContingencyPct, discountPct, vatPct,
    generalReqts: parsed.generalReqts, components: parsed.components, services: parsed.services,
    manpower, servicesFromManpower: parsed.services.length <= 1 && manpower.length > 0,
    legacyTotalsSnapshot: parsed.totals,
  };
}

const quotations = [];
const ioctQ = parseOne(ioctWs, 'IOCT'); if (ioctQ) quotations.push(ioctQ);
const actiQ = parseOne(actiWs, 'ACTI'); if (actiQ) quotations.push(actiQ);

const customer = {
  code: clientCode || 'XXX', name: info.clientName, contact: info.contact,
  email: info.emailOrPhone.includes('@') ? info.emailOrPhone : undefined,
  phone: info.emailOrPhone.includes('@') ? undefined : info.emailOrPhone,
  address: info.location, gender: info.gender, paymentTerms: info.paymentTerms,
};

const result = {
  originalCode: refNo, baseCode, yymm, seqFromOriginal, clientCode: clientCode || 'XXX',
  revision, projectName, date: info.date, customer, quotations,
  warnings, sourceFile: filename, projectFolder,
};

console.log(JSON.stringify(result, null, 2));
