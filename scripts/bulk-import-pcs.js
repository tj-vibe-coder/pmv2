/**
 * Phase 2 driver: bulk-import the 31 PCS workbooks as legacy quotations.
 *
 * Usage:
 *   node scripts/bulk-import-pcs.js              # dry-run: lists what would happen
 *   node scripts/bulk-import-pcs.js --apply      # writes to Firestore
 *
 * What it does:
 *   - Enumerates every Calsheet/*.xlsx under PCS folders (skips templates / lock files)
 *   - Parses each via the existing CLI parser
 *   - Generates the effective code (recover from folder, or assign fresh seq for non-PCS clients)
 *   - Looks up client by code in `clients`; creates a new client doc if missing
 *   - For each kind (IOCT + ACTI), creates a quotation in `calcsheet_quotations` with
 *     formulaVersion='legacy' and legacyTotalsSnapshot frozen
 *   - Captures the PDF filename(s) found in the sibling /Offer/ folder into
 *     importedFrom.pdfFilename (no kind detection — that requires the browser parser)
 *   - Writes a row to `calcsheet_import_audit` per workbook
 *   - Mode: overwrite — if project code exists already, deletes its quotations + project and recreates
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
} else {
  const keyFile = path.join(__dirname, '..', 'pmv2-851ae-firebase-adminsdk-fbsvc-c4d13e6cb1.json');
  credential = admin.credential.cert(require(keyFile));
}
admin.initializeApp({ credential });
const db = admin.firestore();

const ROOT = '/Users/reuelrivera/Documents/Projects/IOCT Calcsheet/IO Proposal';
const PARSER = path.join(__dirname, 'parse-legacy-calcsheet.js');
const apply = process.argv.includes('--apply');

const PCS_RE = /^PCS\d{4}\d{3}-[A-Z&]{3}-\d{2}$/;
function isPCSCode(code) { return PCS_RE.test(code); }

function assignLegacyCode(yymm, seq, clientCode, revision = '00') {
  const cli = (clientCode || 'XXX').toUpperCase().slice(0, 3).padEnd(3, 'X');
  return `PCS${yymm}${String(seq).padStart(3, '0')}-${cli}-${revision}`;
}

async function highestPCSSequence() {
  const snap = await db.collection('calcsheet_projects').get();
  let max = 0;
  snap.docs.forEach((d) => {
    const code = d.data().code || '';
    const m = code.match(/^PCS\d{4}(\d{3})-/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return max;
}

async function findClientByCode(code) {
  const s = await db.collection('clients').where('code', '==', code).limit(1).get();
  return s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() };
}

async function upsertClientFromParsed(parsed) {
  const code = parsed.customer.code;
  if (!code) return null;
  const existing = await findClientByCode(code);
  if (existing) return existing.id;
  // Create new client in unified `clients` collection
  const now = new Date().toISOString();
  const contact = parsed.customer.contact ? {
    id: Math.random().toString(36).slice(2, 10),
    name: parsed.customer.contact,
    position: '',
    email: parsed.customer.email || '',
    phone: parsed.customer.phone || '',
    gender: parsed.customer.gender || '',
    isPrimary: true,
  } : null;
  const newClient = {
    code,
    name: parsed.customer.name || '',
    address: parsed.customer.address || '',
    paymentTerms: parsed.customer.paymentTerms || '',
    am: '',
    contacts: contact ? [contact] : [],
    createdAt: now,
    updatedAt: now,
  };
  const ref = await db.collection('clients').add(newClient);
  return ref.id;
}

async function deleteExistingProjectByCode(code) {
  const s = await db.collection('calcsheet_projects').where('code', '==', code).limit(1).get();
  if (s.empty) return false;
  const oldId = s.docs[0].id;
  const oldQs = await db.collection('calcsheet_quotations').where('projectId', '==', oldId).get();
  const batch = db.batch();
  oldQs.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(s.docs[0].ref);
  await batch.commit();
  return true;
}

async function importOne(file, nextSeqRef) {
  const proc = spawnSync('node', [PARSER, file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (proc.status !== 0) {
    return { file, status: 'parse-error', message: proc.stderr.split('\n')[0] };
  }
  const parsed = JSON.parse(proc.stdout);

  // Compute effective code
  let effectiveCode = parsed.originalCode;
  let reassigned = false;
  const reconstructed = parsed.yymm && parsed.seqFromOriginal && parsed.clientCode
    ? assignLegacyCode(parsed.yymm, parsed.seqFromOriginal, parsed.clientCode, parsed.revision || '00')
    : null;

  if (isPCSCode(parsed.originalCode)) {
    effectiveCode = parsed.originalCode;
  } else if (reconstructed && isPCSCode(reconstructed)) {
    effectiveCode = reconstructed;
    reassigned = true;
  } else {
    const yymm = parsed.yymm || '0000';
    effectiveCode = assignLegacyCode(yymm, nextSeqRef.next, parsed.clientCode, parsed.revision || '00');
    nextSeqRef.next += 1;
    reassigned = true;
  }

  // Find PDF files in /Offer/ (no kind detection — CLI doesn't have pdfjs available)
  const folder = path.dirname(path.dirname(file));
  const offerDir = path.join(folder, 'Offer');
  let offerPdfs = [];
  try {
    offerPdfs = fs.readdirSync(offerDir).filter((f) => /\.pdf$/i.test(f));
  } catch {}

  return {
    file,
    status: 'parsed',
    parsed,
    effectiveCode,
    reassigned,
    offerPdfs,
    folder: path.basename(folder),
  };
}

function buildQuotation(parsedQ, projectId, sourceFile, originalCode, pdfFilename) {
  const importedFrom = {
    sourceFile,
    importedAt: new Date().toISOString(),
    originalCode,
  };
  if (pdfFilename) importedFrom.pdfFilename = pdfFilename;
  return {
    projectId,
    kind: parsedQ.kind,
    revision: parsedQ.revision,
    recipientId: null, // set by caller
    validityDays: parsedQ.validityDays,
    paymentTerms: parsedQ.paymentTerms,
    deliveryTerms: parsedQ.deliveryTerms,
    warrantyMonths: parsedQ.warrantyMonths,
    productMarkupPct: parsedQ.productMarkupPct,
    laborMarkupPct: parsedQ.laborMarkupPct,
    generalReqMarkupPct: parsedQ.generalReqMarkupPct,
    globalContingencyPct: parsedQ.globalContingencyPct,
    discountPct: parsedQ.discountPct,
    vatPct: parsedQ.vatPct,
    generalReqts: parsedQ.generalReqts || [],
    components: parsedQ.components || [],
    services: parsedQ.services || [],
    manpower: parsedQ.manpower || [],
    servicesFromManpower: parsedQ.servicesFromManpower,
    preparedBy: parsedQ.preparedBy || '',
    authorizedBy: parsedQ.authorizedBy || 'Renzel Punongbayan',
    legacyTotalsSnapshot: parsedQ.legacyTotalsSnapshot,
    formulaVersion: 'legacy',
    importedFrom,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

(async () => {
  // Enumerate PCS files
  const out = execSync(
    `find "${ROOT}" -path '*/Calsheet/*.xlsx' -not -name '~$*' -not -path '*PCSYYMMXXX*'`,
    { encoding: 'utf8' },
  );
  const files = out.split('\n').filter((f) => f && /PCS\d/.test(f));
  console.log(`Found ${files.length} PCS workbook(s).`);

  // Build a sequence counter for non-PCS clients (A&J etc.)
  const maxSeq = await highestPCSSequence();
  const nextSeqRef = { next: maxSeq + 1 };
  console.log(`Highest existing PCS sequence: ${maxSeq}. Next available: ${nextSeqRef.next}`);

  // Parse all
  const results = [];
  for (const file of files) {
    const r = await importOne(file, nextSeqRef);
    results.push(r);
  }

  // Show plan
  console.log('\n=== PLAN ===');
  console.log(`Effective code · client · IOCT total · ACTI total · PDFs`);
  for (const r of results) {
    if (r.status !== 'parsed') {
      console.log(`  ✗ ${path.basename(r.file)}: ${r.message}`);
      continue;
    }
    const ioct = r.parsed.quotations.find((q) => q.kind === 'IOCT');
    const acti = r.parsed.quotations.find((q) => q.kind === 'ACTI');
    const i = ioct ? `${ioct.generalReqts.length + ioct.components.length + ioct.services.length}ln ₱${ioct.legacyTotalsSnapshot.grandTotal.toFixed(0)}` : '—';
    const a = acti ? `${acti.generalReqts.length + acti.components.length + acti.services.length}ln ₱${acti.legacyTotalsSnapshot.grandTotal.toFixed(0)}` : '—';
    const tag = r.reassigned ? ' (reassigned)' : '';
    console.log(`  ${r.effectiveCode}${tag}  · ${r.parsed.customer.code || '—'}  · IOCT ${i}  · ACTI ${a}  · PDFs ${r.offerPdfs.length}`);
  }

  if (!apply) {
    console.log('\n(dry-run — rerun with --apply to write)');
    process.exit(0);
  }

  console.log('\n=== APPLYING (mode=overwrite) ===');
  let created = 0, overwritten = 0, errors = 0;
  for (const r of results) {
    if (r.status !== 'parsed') { errors++; continue; }
    try {
      // Upsert client
      const customerId = await upsertClientFromParsed(r.parsed);

      // Delete existing project if present
      const wasOverwritten = await deleteExistingProjectByCode(r.effectiveCode);
      if (wasOverwritten) overwritten++; else created++;

      // Create project
      const now = new Date().toISOString();
      const projectData = {
        code: r.effectiveCode,
        name: r.parsed.projectName || '(no name)',
        location: r.parsed.customer.address || '',
        date: r.parsed.date,
        customerId: customerId || null,
        partnerId: null,
        salesContactId: null,
        status: 'sent',
        createdAt: now,
        updatedAt: now,
      };
      const projRef = await db.collection('calcsheet_projects').add(projectData);

      // Determine PDF mapping (filename-based revision match; no IOCT/ACTI kind detection)
      const pdfForRev = (rev) => r.offerPdfs.find((p) => p.includes(`-${rev}.pdf`)) || r.offerPdfs.join(', ') || null;

      // Create quotations
      for (const q of r.parsed.quotations) {
        const doc = buildQuotation(q, projRef.id, r.file, r.parsed.originalCode, pdfForRev(q.revision));
        doc.recipientId = customerId;
        // Auto-set contactId to the matched client's primary contact (only if present)
        if (customerId) {
          const clientDoc = await db.collection('clients').doc(customerId).get();
          const c = clientDoc.data();
          const primary = (c?.contacts || []).find((x) => x.isPrimary) || (c?.contacts || [])[0];
          if (primary) doc.contactId = primary.id;
        }
        // Strip any remaining undefined values to satisfy Firestore
        Object.keys(doc).forEach((k) => { if (doc[k] === undefined) delete doc[k]; });
        await db.collection('calcsheet_quotations').add(doc);
      }

      // Audit
      await db.collection('calcsheet_import_audit').add({
        action: wasOverwritten ? 'overwritten' : 'created',
        mode: 'bulk-cli',
        projectCode: r.effectiveCode,
        projectId: projRef.id,
        sourceFile: r.file,
        originalCode: r.parsed.originalCode,
        quotationCount: r.parsed.quotations.length,
        warnings: r.parsed.warnings || [],
        importedAt: now,
        importedBy: 'cli',
      });

      console.log(`  ✓ ${r.effectiveCode}  (project + ${r.parsed.quotations.length} quotation(s))`);
    } catch (err) {
      errors++;
      console.error(`  ✗ ${r.effectiveCode}: ${err.message}`);
    }
  }

  console.log(`\nDone. created=${created} overwritten=${overwritten} errors=${errors}`);
  process.exit(0);
})().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
