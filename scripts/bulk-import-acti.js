/**
 * Phase 3 driver: bulk-import the 4 ACTI-pattern projects as legacy ACTI quotations,
 * assigning fresh PCS codes that preserve the original YYMM.
 *
 * Usage:
 *   node scripts/bulk-import-acti.js              # dry-run
 *   node scripts/bulk-import-acti.js --apply      # writes to Firestore
 *
 * Behavior:
 *   - Walks every ACTI* folder in IO Proposal
 *   - Picks one xlsx per project (skips ACTI25XX-XX-XX.xlsx template when a real one exists)
 *   - When ONLY the template exists (e.g. EBECOR): creates a stub project, no quotation
 *   - Parses the real workbook via the existing parser (variant: 'ACTI')
 *   - Maps client by inferred code (or folder-name first token), upserts in `clients`
 *   - Assigns PCS code: PCS{originalYYMM}{nextSeq}-{CLI}-00, continuing the global sequence
 *   - Creates project + ACTI quotation (formulaVersion='legacy') in calcsheet_*
 *   - Records audit entry with both originalCode and the new PCS code
 *   - Mode: overwrite (safe re-run)
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

const isTemplateName = (n) => /^ACTI25XX-XX-XX\.xlsx?$/i.test(n) || /^PCSYYMMXXX\.xlsx?$/i.test(n);

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
  if (!code) return null;
  const s = await db.collection('clients').where('code', '==', code).limit(1).get();
  return s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() };
}

async function upsertClient(parsedCustomer) {
  const code = parsedCustomer.code;
  if (!code) return null;
  const existing = await findClientByCode(code);
  if (existing) return existing.id;
  const now = new Date().toISOString();
  const contact = parsedCustomer.contact ? {
    id: Math.random().toString(36).slice(2, 10),
    name: parsedCustomer.contact,
    position: '',
    email: parsedCustomer.email || '',
    phone: parsedCustomer.phone || '',
    gender: parsedCustomer.gender || '',
    isPrimary: true,
  } : null;
  const newClient = {
    code,
    name: parsedCustomer.name || '',
    address: parsedCustomer.address || '',
    paymentTerms: parsedCustomer.paymentTerms || '',
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

// For each ACTI folder, pick the xlsx file to parse and any offer PDFs.
function discoverACTIFolders() {
  const dirs = fs.readdirSync(ROOT).filter((d) => /^ACTI/i.test(d));
  const results = [];
  for (const d of dirs) {
    const calcDir = path.join(ROOT, d, 'Calcsheet');
    let xlsxFiles = [];
    try {
      xlsxFiles = fs.readdirSync(calcDir).filter((f) => /\.xlsx?$/i.test(f) && !f.startsWith('~$'));
    } catch {}
    const reals = xlsxFiles.filter((f) => !isTemplateName(f));
    const templates = xlsxFiles.filter((f) => isTemplateName(f));
    const chosen = reals.length > 0 ? reals[0] : (templates.length > 0 ? templates[0] : null);
    const stubOnly = reals.length === 0;

    let offerPdfs = [];
    try {
      const offerDir = path.join(ROOT, d, 'Offer');
      offerPdfs = fs.readdirSync(offerDir).filter((f) => /\.pdf$/i.test(f));
    } catch {}

    if (chosen) {
      results.push({
        folder: d,
        xlsxPath: path.join(calcDir, chosen),
        xlsxName: chosen,
        stubOnly,
        offerPdfs,
      });
    } else {
      results.push({ folder: d, xlsxPath: null, xlsxName: null, stubOnly: true, offerPdfs });
    }
  }
  return results;
}

// Try to derive client code from folder name. Returns a KNOWN code when confident, else null.
function inferClientFromFolder(folder) {
  const fm = folder.match(/^ACTI(\d{2})(\d{2})-(\d{2})-([A-Z]{3})\s+(.+?)\s*$/);
  if (!fm) return null;
  const restAfterSales = fm[5];
  const firstToken = restAfterSales.split(/\s+/)[0].toUpperCase();
  const map = {
    EBECOR: 'EBC', LBI: 'LBI', ADI: 'ADI', ANALOG: 'ADI',
    ICI: 'ICI', INNOVATIVE: 'ICI', TANN: 'TPI',
    RYONAN: 'REP', BELMONT: 'BLI',
  };
  // Strong signals first
  if (/B1\s*PH?\s*[12]/i.test(restAfterSales) || /B1\s*P\s*[12]/i.test(restAfterSales)) return 'ADI';
  if (map[firstToken]) return map[firstToken];
  return null; // unknown — caller should fall back to parsed General Info data
}

// Resolve client code by name keywords (used when folder doesn't disambiguate).
function inferClientFromName(name) {
  if (!name) return null;
  const s = name.toLowerCase();
  if (/analog devices|analogue devices/.test(s)) return 'ADI';
  if (/innovative controls/.test(s)) return 'ICI';
  if (/ebecor/.test(s)) return 'EBC';
  if (/lbi philippines/.test(s)) return 'LBI';
  if (/ryonan|repco/.test(s)) return 'REP';
  if (/tann philippines/.test(s)) return 'TPI';
  if (/belmont/.test(s)) return 'BLI';
  if (/barghest/.test(s)) return 'BBP';
  if (/advance controle/.test(s)) return 'ACT';
  if (/next.serve/.test(s)) return 'NEX';
  if (/controltrade/.test(s)) return 'CEI';
  if (/industrial solutions/.test(s)) return 'IST';
  if (/smartech/.test(s)) return 'SLC';
  return null;
}

(async () => {
  const projects = discoverACTIFolders();
  console.log(`Found ${projects.length} ACTI project folder(s).`);

  const maxSeq = await highestPCSSequence();
  let nextSeq = maxSeq + 1;
  console.log(`Highest existing PCS sequence: ${maxSeq}. Next available: ${nextSeq}\n`);

  // Parse + plan
  const plans = [];
  for (const p of projects) {
    if (!p.xlsxPath) {
      plans.push({ ...p, status: 'no-xlsx' });
      continue;
    }
    const proc = spawnSync('node', [PARSER, p.xlsxPath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (proc.status !== 0) {
      plans.push({ ...p, status: 'parse-error', message: proc.stderr.split('\n')[0] });
      continue;
    }
    const parsed = JSON.parse(proc.stdout);

    // For stub-only (template-as-source) — folder name is authoritative; ignore General Info content
    if (p.stubOnly) {
      const fm = p.folder.match(/^ACTI(\d{2})(\d{2})-(\d{2})-([A-Z]{3})\s+(.+?)\s*$/);
      const yymm = fm ? `${fm[1]}${fm[2]}` : parsed.yymm || '2511';
      const clientCode = inferClientFromFolder(p.folder) || 'XXX';
      const newCode = assignLegacyCode(yymm, nextSeq, clientCode, '00');
      nextSeq += 1;
      plans.push({
        ...p,
        status: 'stub',
        newCode,
        yymm,
        clientCode,
        salesCode: fm ? fm[4] : '',
        projectName: fm ? fm[5] : p.folder,
        originalCode: p.folder,
      });
      continue;
    }

    // Real parse path
    const yymm = parsed.yymm || '2511';
    // Resolve client code with priority:
    //   1) known mapping from folder first token
    //   2) parsed General Info clientName matched against known clients
    //   3) parsed.clientCode (heuristic from the parser)
    //   4) 'XXX' fallback
    const folderClient = inferClientFromFolder(p.folder);
    const nameClient = inferClientFromName(parsed.customer.name);
    const clientCode = folderClient || nameClient || parsed.clientCode || 'XXX';
    const newCode = assignLegacyCode(yymm, nextSeq, clientCode, parsed.revision || '00');
    nextSeq += 1;
    plans.push({
      ...p,
      status: 'parsed',
      parsed,
      newCode,
      yymm,
      clientCode,
      salesCode: parsed.salesCode,
      projectName: parsed.projectName,
      originalCode: parsed.originalCode,
    });
  }

  // Print plan
  console.log('=== PLAN ===');
  for (const pl of plans) {
    console.log(`\n  Folder: ${pl.folder}`);
    if (pl.status === 'no-xlsx') {
      console.log(`    ✗ no xlsx found`);
      continue;
    }
    if (pl.status === 'parse-error') {
      console.log(`    ✗ parse-error: ${pl.message}`);
      continue;
    }
    console.log(`    xlsx: ${pl.xlsxName}${pl.stubOnly ? ' (template — stub-only)' : ''}`);
    console.log(`    code: ${pl.originalCode} → ${pl.newCode}  (sales=${pl.salesCode}, client=${pl.clientCode})`);
    console.log(`    project: ${pl.projectName}`);
    if (pl.status === 'parsed') {
      const q = pl.parsed.quotations[0];
      const t = q.legacyTotalsSnapshot;
      console.log(`    A=${t.generalReqtsSubtotal.toFixed(0)} B=${t.componentsSubtotal.toFixed(0)} C=${t.servicesSubtotal.toFixed(0)} grand=${t.grandTotal.toFixed(0)}`);
      console.log(`    contacts: ${pl.parsed.customer.contact || '—'} <${pl.parsed.customer.email || pl.parsed.customer.phone || ''}>`);
    } else if (pl.status === 'stub') {
      console.log(`    (stub project only — no quotation; template carried wrong sample data)`);
    }
    console.log(`    PDFs in /Offer/: ${pl.offerPdfs.length}`);
  }

  if (!apply) {
    console.log('\n(dry-run — rerun with --apply to write)');
    process.exit(0);
  }

  console.log('\n=== APPLYING (mode=overwrite) ===');
  let created = 0, overwritten = 0, errors = 0;
  for (const pl of plans) {
    if (pl.status !== 'parsed' && pl.status !== 'stub') { errors++; continue; }
    try {
      const now = new Date().toISOString();

      // Resolve / create customer
      let customerId = null;
      if (pl.status === 'parsed') {
        // For real parses, build a customer object that matches the inferred clientCode
        const customer = { ...pl.parsed.customer, code: pl.clientCode };
        customerId = await upsertClient(customer);
      } else if (pl.status === 'stub') {
        // For stub, just look up the client by code if it exists; don't create from template noise
        const existing = await findClientByCode(pl.clientCode);
        if (existing) customerId = existing.id;
      }

      // Replace existing project doc if present
      const wasOverwritten = await deleteExistingProjectByCode(pl.newCode);
      if (wasOverwritten) overwritten++; else created++;

      // Create project
      const projectData = {
        code: pl.newCode,
        name: pl.projectName,
        location: pl.status === 'parsed' ? (pl.parsed.customer.address || '') : '',
        date: pl.status === 'parsed' ? pl.parsed.date : new Date().toISOString().slice(0, 10),
        customerId,
        partnerId: null,
        salesContactId: null,
        status: 'sent',
        createdAt: now,
        updatedAt: now,
      };
      const projRef = await db.collection('calcsheet_projects').add(projectData);

      // For 'parsed', create the ACTI quotation. For 'stub', no quotation.
      if (pl.status === 'parsed') {
        const q = pl.parsed.quotations[0];
        const pdfFilename = pl.offerPdfs.find((p) => p.includes(`-${q.revision}.pdf`)) || pl.offerPdfs.join(', ') || null;
        const importedFrom = {
          sourceFile: pl.xlsxPath,
          importedAt: now,
          originalCode: pl.originalCode,
        };
        if (pdfFilename) importedFrom.pdfFilename = pdfFilename;
        const doc = {
          projectId: projRef.id,
          kind: 'ACTI',
          revision: q.revision,
          recipientId: customerId,
          validityDays: q.validityDays,
          paymentTerms: q.paymentTerms,
          deliveryTerms: q.deliveryTerms,
          warrantyMonths: q.warrantyMonths,
          productMarkupPct: q.productMarkupPct,
          laborMarkupPct: q.laborMarkupPct,
          generalReqMarkupPct: q.generalReqMarkupPct,
          globalContingencyPct: q.globalContingencyPct,
          discountPct: q.discountPct,
          vatPct: q.vatPct,
          generalReqts: q.generalReqts,
          components: q.components,
          services: q.services,
          manpower: q.manpower || [],
          servicesFromManpower: q.servicesFromManpower,
          preparedBy: q.preparedBy || '',
          authorizedBy: q.authorizedBy || 'Tyrone James Caballero',
          legacyTotalsSnapshot: q.legacyTotalsSnapshot,
          formulaVersion: 'legacy',
          importedFrom,
          createdAt: now,
          updatedAt: now,
        };
        // Set contactId to primary of matched client
        if (customerId) {
          const cdoc = await db.collection('clients').doc(customerId).get();
          const cd = cdoc.data();
          const primary = (cd?.contacts || []).find((x) => x.isPrimary) || (cd?.contacts || [])[0];
          if (primary) doc.contactId = primary.id;
        }
        Object.keys(doc).forEach((k) => { if (doc[k] === undefined) delete doc[k]; });
        await db.collection('calcsheet_quotations').add(doc);
      }

      // Audit
      await db.collection('calcsheet_import_audit').add({
        action: wasOverwritten ? 'overwritten' : 'created',
        mode: 'bulk-cli-acti',
        projectCode: pl.newCode,
        projectId: projRef.id,
        sourceFile: pl.xlsxPath || null,
        originalCode: pl.originalCode,
        quotationCount: pl.status === 'parsed' ? 1 : 0,
        warnings: pl.status === 'stub' ? ['template-only — quotation skipped'] : (pl.parsed?.warnings || []),
        importedAt: now,
        importedBy: 'cli',
      });

      console.log(`  ✓ ${pl.newCode}${pl.status === 'stub' ? ' (stub)' : ' (+ ACTI quotation)'}`);
    } catch (err) {
      errors++;
      console.error(`  ✗ ${pl.newCode || pl.folder}: ${err.message}`);
    }
  }

  console.log(`\nDone. created=${created} overwritten=${overwritten} errors=${errors}`);
  process.exit(0);
})().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
