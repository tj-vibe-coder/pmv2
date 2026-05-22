/**
 * Backfill `legacyTotalsSnapshot.{generalReqtsCost, componentsCost, laborCost,
 * laborWithContingency, generalReqtsWithContingency}` for legacy quotations,
 * pulling raw costs from the source xlsx's `Labor and Gen Reqt` + `Products`
 * sheets.
 *
 * Without this, the parser stored cost=subtotal, so marginSummary in the editor
 * (and the new IOCT margin column on /calcsheet/projects) shows zero margin
 * for every legacy quotation. After this script: real margin numbers.
 *
 * Usage:
 *   node scripts/backfill-legacy-costs.js                       # dry-run, prints diff
 *   node scripts/backfill-legacy-costs.js --apply               # writes to Firestore
 *   node scripts/backfill-legacy-costs.js --only PCS2602001     # filter by code prefix
 *
 * Convention:
 *   - Labor cost (raw)    = Σ(qty × mandays × (dailyRate + allowance)) across role rows
 *   - General Reqts cost  = Σ col E "Unit Cost" for A-XXXX rows
 *   - Components cost     = Σ qty × unitPrice for B-XXXX rows in `Products` sheet
 *   - withContingency     = cost × (1 + B3) for labor + GR (components: per-line, folded)
 *
 * Does not touch subtotal / discount / vat / grandTotal — those stay frozen.
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const SERVICE_ACCOUNT = path.join(
  __dirname,
  '..',
  'pmv2-851ae-firebase-adminsdk-fbsvc-c4d13e6cb1.json',
);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(SERVICE_ACCOUNT)),
  });
}
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');
const onlyIdx = process.argv.indexOf('--only');
const ONLY = onlyIdx > 0 ? process.argv[onlyIdx + 1] : null;

const PROPOSAL_ROOT = '/Users/reuelrivera/Documents/Projects/IOCT Calcsheet/IO Proposal';

// Build a basename → absolute path index lazily, used when importedFrom.sourceFile
// is only a filename (in-app uploads carry no path).
let basenameIndex = null;
function buildBasenameIndex() {
  if (basenameIndex) return basenameIndex;
  basenameIndex = new Map();
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.xlsx$/i.test(e.name) && !e.name.startsWith('~$')) {
        // Last writer wins; this is fine — duplicates are typically copies.
        basenameIndex.set(e.name.toLowerCase(), full);
      }
    }
  };
  walk(PROPOSAL_ROOT);
  return basenameIndex;
}

function resolveSourceFile(raw) {
  if (!raw) return null;
  if (/\.pdf$/i.test(raw)) return { skip: 'PDF_ONLY' };
  if (path.isAbsolute(raw) && fs.existsSync(raw)) return { path: raw };
  // Try basename lookup
  const idx = buildBasenameIndex();
  const hit = idx.get(path.basename(raw).toLowerCase());
  if (hit) return { path: hit };
  return null;
}

// ── xlsx helpers ─────────────────────────────────────────────────────────────
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

// PCS template manpower block uses fixed columns:
//   G (6) role name
//   I (8) qty         J (9)  mandays
//   L (11) daily rate M (12) allowance
//
// The same template stacks ENGINEERING then LABORERS (sometimes more) blocks
// vertically; sub-total and TOTAL rows interleave. We accept any row where
// (qty, mandays, daily, allowance) are all numeric and qty/mandays look like
// per-role values (not totals).
function extractLaborCost(ws) {
  const r = rangeOf(ws);
  let total = 0;
  for (let row = 0; row <= r.e.r; row++) {
    const label = text(cellAt(ws, row, 6));
    if (!label) continue;
    const lower = label.toLowerCase();
    if (
      lower.startsWith('manpower') ||
      lower.startsWith('mandays') ||
      lower === 'sub-total' ||
      lower === 'subtotal' ||
      lower === 'total' ||
      lower === 'engineering' ||
      lower === 'laborers' ||
      lower === 'automation' ||
      lower === 'role' ||
      lower === 'roles'
    ) continue;
    const qty = num(cellAt(ws, row, 8));
    const mandays = num(cellAt(ws, row, 9));
    const daily = num(cellAt(ws, row, 11));
    const allow = num(cellAt(ws, row, 12));
    // Per-role values: qty 1..50, mandays 1..1000, daily > 100, allow >= 0.
    if (qty > 0 && qty < 50 && mandays > 0 && mandays < 1000 && daily > 100) {
      total += qty * mandays * (daily + allow);
    }
  }
  return total;
}

// Read General Requirements unit costs from the "Labor and Gen Reqt" sheet.
// Look for A-XXXX rows (col A starts with "A-") and sum col E (idx 4) unit cost.
function extractGeneralReqtsCost(ws) {
  const r = rangeOf(ws);
  let total = 0;
  for (let row = 0; row <= r.e.r; row++) {
    const code = text(cellAt(ws, row, 0));
    if (!/^A-\d{3,4}$/i.test(code)) continue;
    const unitCost = num(cellAt(ws, row, 4));
    // If there's a qty column further right, multiply; otherwise assume 1.
    // The Labor and Gen Reqt template doesn't expose qty for A-XXXX rows; the
    // IOCT/ACTI quotation sheet provides qty separately. We'll use unit cost × 1
    // (qty from the quotation sheet) — this matches what the legacy quote billed.
    total += unitCost;
  }
  return total;
}

// Read components cost from `Products` sheet:
//   Row 11 header: col H=Qty(7), col J=Unit Price(9), col K=Contingency, col L=Discount
function extractComponentsCost(ws) {
  if (!ws) return 0;
  const r = rangeOf(ws);
  let total = 0;
  // Scan all rows for product entries with non-zero unit price + qty.
  // Some workbooks omit the "B-XXXX" code on populated rows (see ACTI variant
  // dump where col A was blank but unit price + qty were populated).
  for (let row = 11; row <= r.e.r; row++) {
    const qty = num(cellAt(ws, row, 7));
    const unitPrice = num(cellAt(ws, row, 9));
    if (qty > 0 && unitPrice > 0) {
      total += qty * unitPrice;
    }
  }
  return total;
}

function extractCosts(filePath, quotationKind) {
  let wb;
  try {
    wb = XLSX.readFile(filePath);
  } catch (err) {
    return { error: `xlsx open failed: ${err.message}` };
  }
  const labor = wb.Sheets['Labor and Gen Reqt'];
  const products = wb.Sheets['Products'];
  if (!labor) return { error: 'no `Labor and Gen Reqt` sheet' };

  const marginPct = num(cellAt(labor, 1, 1)); // B2
  const contPct = num(cellAt(labor, 2, 1)); // B3
  // ACTI-variant workbooks (Phase 3) put margin/contingency elsewhere and use a
  // different manpower-block column layout — extraction is unreliable. Detect
  // by missing B2/B3 and surface as a separate status so the user can backfill
  // those manually.
  if (marginPct === 0 && contPct === 0) {
    return { error: 'ACTI-variant template (no B2/B3 margin/contingency) — manual entry required' };
  }
  const cont = contPct > 0 && contPct <= 1 ? contPct : contPct / 100;

  const laborCost = extractLaborCost(labor);
  const grCost = extractGeneralReqtsCost(labor);
  // Components are only billed on the ACTI side typically; IOCT services-only.
  // Compute either way; IOCT snapshot's componentsSubtotal will already be 0
  // when the IOCT sheet had no Section B, so this won't affect the margin math
  // for IOCT (subtotal − cost = 0 − whatever; we'll cap to zero when subtotal is zero).
  const componentsCost = quotationKind === 'ACTI' ? extractComponentsCost(products) : 0;

  return {
    contPct: cont,
    marginPct: marginPct > 0 && marginPct <= 1 ? marginPct : marginPct / 100,
    laborCost,
    laborWithContingency: laborCost * (1 + cont),
    generalReqtsCost: grCost,
    generalReqtsWithContingency: grCost * (1 + cont),
    componentsCost,
  };
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  const snap = await db.collection('calcsheet_quotations').get();
  // NB: spread data first, then set id, to override any stored `id` field
  // from the latent server bug (see CLAUDE.md follow-up #8).
  const quotations = snap.docs
    .map((d) => ({ ...d.data(), id: d.id }))
    .filter((q) => q.formulaVersion === 'legacy')
    .filter((q) => !ONLY || (q.code || '').startsWith(ONLY) || (q.importedFrom?.originalCode || '').startsWith(ONLY));

  console.log(`Found ${quotations.length} legacy quotation(s) to consider${ONLY ? ` (filter: ${ONLY})` : ''}.`);

  const projectsSnap = await db.collection('calcsheet_projects').get();
  const projectsById = new Map(projectsSnap.docs.map((d) => [d.id, d.data()]));

  let updated = 0;
  let skippedNoSource = 0;
  let skippedNoFile = 0;
  let errored = 0;
  let skippedManual = 0;
  const rows = [];

  for (const q of quotations) {
    const proj = projectsById.get(q.projectId);
    const projCode = proj?.code || '(unknown)';
    const ref = `${projCode} ${q.kind} rev${q.revision || '00'}`;

    const sourceFile = q.importedFrom?.sourceFile;
    if (!sourceFile) {
      skippedNoSource++;
      rows.push({ ref, status: 'NO_SOURCE' });
      continue;
    }
    const resolved = resolveSourceFile(sourceFile);
    if (!resolved) {
      skippedNoFile++;
      rows.push({ ref, status: 'FILE_MISSING', sourceFile });
      continue;
    }
    if (resolved.skip) {
      skippedNoFile++;
      rows.push({ ref, status: resolved.skip, sourceFile });
      continue;
    }

    const extracted = extractCosts(resolved.path, q.kind);
    if (extracted.error) {
      if (extracted.error.includes('ACTI-variant')) {
        skippedManual++;
        rows.push({ ref, status: 'MANUAL', error: extracted.error });
      } else {
        errored++;
        rows.push({ ref, status: 'ERROR', error: extracted.error });
      }
      continue;
    }

    const oldSnap = q.legacyTotalsSnapshot || {};
    const subtotal = num(oldSnap.subtotal);
    const totalCost = extracted.laborCost + extracted.generalReqtsCost + extracted.componentsCost;
    const margin = subtotal - num(oldSnap.discount) - totalCost;
    const marginPct = subtotal > 0 ? (margin / subtotal) * 100 : 0;

    rows.push({
      ref,
      status: 'EXTRACTED',
      subtotal,
      laborCost: extracted.laborCost,
      grCost: extracted.generalReqtsCost,
      compCost: extracted.componentsCost,
      totalCost,
      margin,
      marginPct,
      cont: extracted.contPct,
    });

    if (APPLY) {
      const newSnap = {
        ...oldSnap,
        generalReqtsCost: extracted.generalReqtsCost,
        generalReqtsWithContingency: extracted.generalReqtsWithContingency,
        componentsCost: extracted.componentsCost,
        laborCost: extracted.laborCost,
        laborWithContingency: extracted.laborWithContingency,
      };
      const patch = {
        legacyTotalsSnapshot: newSnap,
        globalContingencyPct: Math.round(extracted.contPct * 10000) / 100,
        updatedAt: new Date().toISOString(),
      };
      await db.collection('calcsheet_quotations').doc(q.id).update(patch);
      updated++;
    }
  }

  // Report
  console.log();
  console.log('Ref'.padEnd(36), 'Status'.padEnd(12), 'Subtotal'.padStart(12), 'Cost'.padStart(12), 'Margin'.padStart(12), 'Pct'.padStart(8));
  for (const r of rows) {
    if (r.status === 'EXTRACTED') {
      console.log(
        r.ref.padEnd(36),
        r.status.padEnd(12),
        r.subtotal.toFixed(2).padStart(12),
        r.totalCost.toFixed(2).padStart(12),
        r.margin.toFixed(2).padStart(12),
        (r.marginPct.toFixed(1) + '%').padStart(8),
      );
    } else {
      console.log(r.ref.padEnd(36), r.status.padEnd(12), r.error || r.sourceFile || '');
    }
  }
  console.log();
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Updated: ${updated}, NoSource: ${skippedNoSource}, FileMissing/PDF: ${skippedNoFile}, ManualNeeded: ${skippedManual}, Errors: ${errored}`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
