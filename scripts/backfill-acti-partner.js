/**
 * Backfill ACTI / partner fields on monitoring projects.
 *
 * Phase A of the ACTI-joint monitoring feature. Existing monitoring projects that
 * were promoted from Calcsheet before the promotion mapping learned about partners
 * carry no `with_acti` / `partner_id` / `partner_name`. This script re-derives those
 * by joining each monitoring project back to its Calcsheet project (via
 * `calcsheet_project_id`) and quotations.
 *
 * A project is flagged joint-with-ACTI when the Calcsheet project has a `partnerId`
 * OR an `ACTI`-kind quotation exists under it — the same rule the server now applies
 * at promotion time.
 *
 * Usage:
 *   node scripts/backfill-acti-partner.js            # dry run (prints what would change)
 *   node scripts/backfill-acti-partner.js --apply    # write the changes
 *
 * Credentials: reads FIREBASE_SERVICE_ACCOUNT env var first, then falls back to
 * the service account JSON file in the project root.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ── credentials ──────────────────────────────────────────────────────────────
let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
} else {
  const keyFile = path.join(__dirname, '..', 'pmv2-851ae-firebase-adminsdk-fbsvc-c4d13e6cb1.json');
  if (!fs.existsSync(keyFile)) {
    console.error('No credentials found. Set FIREBASE_SERVICE_ACCOUNT or place the service account JSON in the project root.');
    process.exit(1);
  }
  credential = admin.credential.cert(require(keyFile));
}

admin.initializeApp({ credential });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');

(async () => {
  const projSnap = await db.collection('projects').get();
  // Only projects that came from Calcsheet can be re-derived from the calcsheet side.
  const candidates = projSnap.docs.filter((d) => {
    const p = d.data();
    return p.calcsheet_project_id || p.source_module === 'calcsheet';
  });

  // Cache client names so we don't re-fetch the same partner repeatedly.
  const clientNameCache = new Map();
  const resolveClientName = async (clientId) => {
    if (!clientId) return '';
    if (clientNameCache.has(clientId)) return clientNameCache.get(clientId);
    const doc = await db.collection('clients').doc(String(clientId)).get();
    const name = doc.exists ? (doc.data().name || '') : '';
    clientNameCache.set(clientId, name);
    return name;
  };

  let toUpdate = 0;
  let flaggedJoint = 0;
  let skippedNoCalcsheet = 0;
  const batchWrites = [];

  for (const d of candidates) {
    const p = d.data();
    const csId = p.calcsheet_project_id;
    if (!csId) { skippedNoCalcsheet++; continue; }

    const csDoc = await db.collection('calcsheet_projects').doc(String(csId)).get();
    if (!csDoc.exists) { skippedNoCalcsheet++; continue; }
    const cs = csDoc.data();

    const qSnap = await db.collection('calcsheet_quotations').where('projectId', '==', String(csId)).get();
    const hasActiQuotation = qSnap.docs.some((q) => q.data().kind === 'ACTI');

    const withActi = !!cs.partnerId || hasActiQuotation;
    const partnerId = cs.partnerId || null;
    const partnerName = partnerId ? await resolveClientName(partnerId) : '';

    // Skip if the project already matches what we'd write.
    const same =
      !!p.with_acti === withActi &&
      (p.partner_id ?? null) === partnerId &&
      (p.partner_name || '') === partnerName;
    if (same) continue;

    if (withActi) flaggedJoint++;
    toUpdate++;
    console.log(
      `${p.project_no || d.id}  "${p.project_name || ''}"  ->  with_acti=${withActi}` +
      (partnerId ? `  partner=${partnerName || partnerId}` : '')
    );
    batchWrites.push({ ref: d.ref, data: { with_acti: withActi, partner_id: partnerId, partner_name: partnerName } });
  }

  console.log(
    `\n${candidates.length} calcsheet-sourced project(s); ${toUpdate} need updating ` +
    `(${flaggedJoint} flagged joint-with-ACTI); ${skippedNoCalcsheet} skipped (no calcsheet link).`
  );

  if (!APPLY) {
    console.log('\nDry run — no writes. Re-run with --apply to persist.');
    process.exit(0);
  }

  // Commit in chunks of 400 (Firestore batch limit is 500).
  for (let i = 0; i < batchWrites.length; i += 400) {
    const batch = db.batch();
    const now = new Date().toISOString();
    batchWrites.slice(i, i + 400).forEach(({ ref, data }) => batch.update(ref, { ...data, updated_at: now }));
    await batch.commit();
  }
  console.log(`\nApplied ${batchWrites.length} update(s).`);
  process.exit(0);
})().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
