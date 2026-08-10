/**
 * One-off migration: renumber existing liquidation form numbers from the old
 * LQ-#### scheme to LQ<YY>-<###>-<INITIALS> (e.g. LQ-0022 -> LQ26-002-RPP).
 * Cascades the rename into reimbursements.formNo and the "Liquidation LQ-XXXX:"
 * prefix in project_expenses.description so every visible reference stays
 * consistent. Does NOT touch liquidation_revision_audit (historical audit
 * trail) or qr_pairings/scan_jobs (completed scan-session artifacts).
 *
 * Usage:
 *   node scripts/migrate-liquidation-form-numbers.js           # dry run, prints plan only
 *   node scripts/migrate-liquidation-form-numbers.js --apply   # writes to Firestore
 */
const admin = require('firebase-admin');
const path = require('path');

const keyPath = path.join(process.cwd(), 'pmv2-851ae-firebase-adminsdk-fbsvc-c4d13e6cb1.json');
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');

// Chronological order (by created_at), assigned in this session per RJ's confirmation.
const RENAMES = [
  { id: 'liq_4', oldFormNo: 'LQ-001', newFormNo: 'LQ26-001-TJC' },
  { id: 'liq_8', oldFormNo: 'LQ-0022', newFormNo: 'LQ26-002-RPP' },
  { id: 'liq_10', oldFormNo: 'LQ-0023', newFormNo: 'LQ26-003-RPP' },
  { id: 'X6SbI7Qqez5hyVxAgShH', oldFormNo: 'LQ-0025', newFormNo: 'LQ26-004-RPP' },
  { id: 'p8ymnCEcqUpJQ5tk0gt1', oldFormNo: 'LQ-0026', newFormNo: 'LQ26-005-KKS' },
  { id: 'NvK6bFSsYyfGaX51tW7T', oldFormNo: 'LQ-0027', newFormNo: 'LQ26-006-TJC' },
  { id: 'OyH5bOw8Ag8PUne6HbKL', oldFormNo: 'LQ-0028', newFormNo: 'LQ26-007-TJC' },
  { id: 'QmmiGUbF5zO029VcN0kg', oldFormNo: 'LQ-0030', newFormNo: 'LQ26-008-RPP' },
  { id: '0UQNejKRDq4LDS92fZGt', oldFormNo: 'LQ-0032', newFormNo: 'LQ26-009-KKS' },
  { id: 'udoHuwIX4zxrLGzoDXed', oldFormNo: 'LQ-0033', newFormNo: 'LQ26-010-NDM' },
  { id: 'g4IdCFV3C67yPOfNkFTj', oldFormNo: 'LQ-0034', newFormNo: 'LQ26-011-RPP' },
];

async function main() {
  console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN (pass --apply to write) ===');

  // 1. liquidations.form_no
  for (const r of RENAMES) {
    const ref = db.collection('liquidations').doc(r.id);
    const snap = await ref.get();
    if (!snap.exists) { console.warn(`SKIP liquidations/${r.id}: not found`); continue; }
    const current = snap.data().form_no;
    if (current !== r.oldFormNo) {
      console.warn(`SKIP liquidations/${r.id}: expected form_no "${r.oldFormNo}", found "${current}"`);
      continue;
    }
    console.log(`liquidations/${r.id}: ${r.oldFormNo} -> ${r.newFormNo}`);
    if (APPLY) await ref.update({ form_no: r.newFormNo, updated_at: Math.floor(Date.now() / 1000) });
  }

  // 2. reimbursements.formNo (same doc ids as liquidations, per earlier inspection)
  for (const r of RENAMES) {
    const ref = db.collection('reimbursements').doc(r.id);
    const snap = await ref.get();
    if (!snap.exists) continue; // not every liquidation has a reimbursement doc
    const current = snap.data().formNo;
    if (current !== r.oldFormNo) {
      console.warn(`SKIP reimbursements/${r.id}: expected formNo "${r.oldFormNo}", found "${current}"`);
      continue;
    }
    console.log(`reimbursements/${r.id}: ${r.oldFormNo} -> ${r.newFormNo}`);
    if (APPLY) await ref.update({ formNo: r.newFormNo });
  }

  // 3. project_expenses.description — rewrite "Liquidation LQ-XXXX:" prefix
  const byOld = new Map(RENAMES.map(r => [r.oldFormNo, r.newFormNo]));
  const peSnap = await db.collection('project_expenses').get();
  let peCount = 0;
  const batchSize = 400;
  let batch = db.batch();
  let opsInBatch = 0;
  for (const doc of peSnap.docs) {
    const desc = doc.data().description;
    if (typeof desc !== 'string') continue;
    const m = desc.match(/^Liquidation (LQ-\d+):/);
    if (!m || !byOld.has(m[1])) continue;
    const newDesc = desc.replace(m[1], byOld.get(m[1]));
    peCount++;
    console.log(`project_expenses/${doc.id}: "${desc}" -> "${newDesc}"`);
    if (APPLY) {
      batch.update(doc.ref, { description: newDesc });
      opsInBatch++;
      if (opsInBatch >= batchSize) { await batch.commit(); batch = db.batch(); opsInBatch = 0; }
    }
  }
  if (APPLY && opsInBatch > 0) await batch.commit();

  console.log(`\nTotals: ${RENAMES.length} liquidations, ${peCount} project_expenses descriptions.`);
  if (!APPLY) console.log('Dry run only — re-run with --apply to write these changes.');
}

main().catch(err => { console.error(err); process.exit(1); });
