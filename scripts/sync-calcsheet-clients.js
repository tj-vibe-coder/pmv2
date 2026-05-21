/**
 * Sync calcsheet_clients in Firestore from a hard-coded source-of-truth list.
 *
 * Usage:
 *   node scripts/sync-calcsheet-clients.js              # dry-run, prints what would change
 *   node scripts/sync-calcsheet-clients.js --apply      # writes changes to Firestore
 *
 * Behavior:
 *   - Upserts each client by `code`.
 *   - For existing docs (matched by code), updates in place to preserve the existing doc id.
 *   - For new codes, creates a new doc.
 *   - Codes in Firestore but not in the source list are LEFT ALONE (logged but not deleted).
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
} else {
  const keyFile = path.join(__dirname, '..', 'pmv2-851ae-firebase-adminsdk-fbsvc-c4d13e6cb1.json');
  if (!fs.existsSync(keyFile)) {
    console.error('No credentials found.');
    process.exit(1);
  }
  credential = admin.credential.cert(require(keyFile));
}
admin.initializeApp({ credential });
const db = admin.firestore();

// ─────────────────────────────────────────────────────────────────────────────
// HISTORICAL: this was a one-time sync that pushed customer contact records
// into Firestore (collection `calcsheet_clients`). It has already been run on
// the production project and the real data now lives in Firestore. The inline
// SOURCE table previously held customer names, emails, phone numbers and
// addresses — that PII has been removed from source control. If you need to
// re-run this script, load the records from a local file you do not commit:
//
//   const SOURCE = JSON.parse(fs.readFileSync(process.env.CLIENT_SEED_PATH));
//
// ─────────────────────────────────────────────────────────────────────────────
const PT_STANDARD = '30% downpayment, 70% progress billing based on mutually agreed project milestones.';
const fs = require('fs');
const seedPath = process.env.CLIENT_SEED_PATH;
const SOURCE = seedPath && fs.existsSync(seedPath)
  ? JSON.parse(fs.readFileSync(seedPath, 'utf8'))
  : [
      // Codes-only placeholder. Real data must be provided via CLIENT_SEED_PATH.
      { code: 'ADI', name: 'Analog Devices Inc.', paymentTerms: PT_STANDARD },
      { code: 'ICI', name: 'Innovative Controls, Inc.', paymentTerms: PT_STANDARD },
      { code: 'EBC', name: 'Ebecor Corporation', paymentTerms: '60 days upon project Completion' },
      { code: 'LBI', name: 'LBI Philippines Inc.', paymentTerms: PT_STANDARD },
      { code: 'REP', name: 'Ryonan Electric Philippines Corporation', paymentTerms: PT_STANDARD },
      { code: 'TPI', name: 'Tann Philippines Inc.', paymentTerms: PT_STANDARD },
      { code: 'BLI', name: 'Belmont Laboratories Inc.', paymentTerms: PT_STANDARD },
      { code: 'BBP', name: 'Barghest Building Performance', paymentTerms: PT_STANDARD },
      { code: 'ACT', name: 'Advance Controle Technologie Inc', paymentTerms: PT_STANDARD },
      { code: 'NEX', name: 'Next-Serve Maintenance Management, Inc.', paymentTerms: PT_STANDARD },
      { code: 'CEI', name: 'Controltrade Enterprises Inc.', paymentTerms: PT_STANDARD },
      { code: 'IST', name: 'Industrial Solutions & Technical Services Corp.', paymentTerms: PT_STANDARD },
      { code: 'SLC', name: 'Smartech LE Control Inc.', paymentTerms: '100% upon completion.' },
    ];

const apply = process.argv.includes('--apply');

(async () => {
  // Fetch existing clients
  const snap = await db.collection('calcsheet_clients').get();
  const existingByCode = new Map();
  snap.docs.forEach((d) => {
    const data = d.data();
    if (data.code) existingByCode.set(data.code, { id: d.id, ...data });
  });
  console.log(`Found ${existingByCode.size} existing client(s) in calcsheet_clients.`);

  const ops = []; // { kind: 'create'|'update', code, target }
  for (const src of SOURCE) {
    const existing = existingByCode.get(src.code);
    if (!existing) {
      ops.push({ kind: 'create', code: src.code, target: src });
      continue;
    }
    // Diff: collect fields that differ
    const diffs = [];
    for (const key of Object.keys(src)) {
      if ((src[key] ?? '') !== (existing[key] ?? '')) diffs.push(key);
    }
    if (diffs.length > 0) {
      ops.push({ kind: 'update', code: src.code, id: existing.id, target: src, diffs });
    }
  }

  // Codes in DB not in source — report only
  const orphans = [...existingByCode.keys()].filter((c) => !SOURCE.find((s) => s.code === c));

  console.log('\n=== PLAN ===');
  for (const op of ops) {
    if (op.kind === 'create') {
      console.log(`  CREATE  ${op.code}  ${op.target.name}`);
    } else {
      console.log(`  UPDATE  ${op.code}  ${op.target.name}  (fields: ${op.diffs.join(', ')})`);
    }
  }
  if (orphans.length) console.log(`  (left alone: ${orphans.join(', ')})`);
  console.log(`\n${ops.length} change(s) ${apply ? 'WILL BE APPLIED' : 'would be applied (dry-run; rerun with --apply to write)'}`);

  if (apply && ops.length > 0) {
    const batch = db.batch();
    for (const op of ops) {
      if (op.kind === 'create') {
        const ref = db.collection('calcsheet_clients').doc();
        batch.set(ref, op.target);
      } else {
        const ref = db.collection('calcsheet_clients').doc(op.id);
        batch.update(ref, op.target);
      }
    }
    await batch.commit();
    console.log('\nApplied.');
  }
  process.exit(0);
})().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
