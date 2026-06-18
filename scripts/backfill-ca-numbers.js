/**
 * Backfill `ca_no` (human-readable CA reference number) on existing
 * `cash_advances` docs.
 *
 * Format:
 *   - CA tied to a project with a project_no  →  {project_no}-CA{NN}
 *       e.g. IOCT2606001-CA01 (per-project sequence, chronological)
 *   - CA with no resolvable project           →  CA{YYMM}-{NNN}
 *       e.g. CA2606-001 (global monthly fallback, from requested_at/created_at)
 *
 * Matches the runtime generator `nextCaNo()` in server.js, so backfilled and
 * newly-created numbers share one sequence per project.
 *
 * Usage:
 *   node scripts/backfill-ca-numbers.js          # dry-run, prints assignments
 *   node scripts/backfill-ca-numbers.js --apply  # writes to Firestore
 *
 * Idempotent: docs that already have a ca_no are skipped, but their numbers
 * seed the sequences so re-runs never collide.
 */

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

function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Philippine business date (UTC+8) → YYMM, mirrors server.js phYearMonth().
function phYearMonth(dateLike) {
  const base = dateLike ? new Date(dateLike) : new Date();
  const time = Number.isFinite(base.getTime()) ? base.getTime() : Date.now();
  const ph = new Date(time + 8 * 60 * 60 * 1000);
  const yy = String(ph.getUTCFullYear()).slice(-2);
  const mm = String(ph.getUTCMonth() + 1).padStart(2, '0');
  return `${yy}${mm}`;
}

async function main() {
  const projSnap = await db.collection('projects').get();
  const projectNoById = new Map();
  projSnap.docs.forEach((d) => {
    const no = String(d.data().project_no || '').trim().toUpperCase();
    if (no) projectNoById.set(d.id, no);
  });

  const caSnap = await db.collection('cash_advances').get();
  const docs = caSnap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));

  // Seed sequences from any docs that already carry a ca_no.
  const projectSeq = new Map(); // project_no -> max NN
  const monthSeq = new Map();   // YYMM -> max NNN
  for (const ca of docs) {
    const existing = String(ca.ca_no || '').trim().toUpperCase();
    if (!existing) continue;
    let m = existing.match(/^(.+)-CA(\d+)$/);
    if (m) {
      const n = parseInt(m[2], 10);
      if (Number.isFinite(n)) projectSeq.set(m[1], Math.max(projectSeq.get(m[1]) || 0, n));
      continue;
    }
    m = existing.match(/^CA(\d{4})-(\d{3})$/);
    if (m) {
      const n = parseInt(m[2], 10);
      if (Number.isFinite(n)) monthSeq.set(m[1], Math.max(monthSeq.get(m[1]) || 0, n));
    }
  }

  const missing = docs
    .filter((ca) => !String(ca.ca_no || '').trim())
    .sort((a, b) =>
      (a.created_at || 0) - (b.created_at || 0)
      || (a.requested_at || 0) - (b.requested_at || 0)
      || a.id.localeCompare(b.id));

  if (missing.length === 0) {
    console.log(`All ${docs.length} cash_advances docs already have a ca_no — 0 to update.`);
    return;
  }

  const assignments = [];
  for (const ca of missing) {
    const projectNo = ca.project_id ? projectNoById.get(String(ca.project_id)) || null : null;
    let caNo;
    if (projectNo) {
      const next = (projectSeq.get(projectNo) || 0) + 1;
      projectSeq.set(projectNo, next);
      caNo = `${projectNo}-CA${String(next).padStart(2, '0')}`;
    } else {
      const ym = phYearMonth(((ca.requested_at || ca.created_at) || 0) * 1000 || undefined);
      const next = (monthSeq.get(ym) || 0) + 1;
      monthSeq.set(ym, next);
      caNo = `CA${ym}-${String(next).padStart(3, '0')}`;
    }
    assignments.push({ ca, caNo, projectNo });
  }

  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} — assigning ca_no to ${assignments.length} of ${docs.length} docs:\n`);
  console.log('doc id'.padEnd(24), 'created'.padEnd(12), 'project'.padEnd(16), '→ ca_no');
  for (const { ca, caNo, projectNo } of assignments) {
    const created = ca.created_at ? new Date(ca.created_at * 1000).toISOString().slice(0, 10) : '—';
    console.log(ca.id.padEnd(24), created.padEnd(12), (projectNo || '(no project)').padEnd(16), '→', caNo);
  }

  if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to write.');
    return;
  }

  let written = 0;
  for (let i = 0; i < assignments.length; i += 400) {
    const batch = db.batch();
    assignments.slice(i, i + 400).forEach(({ ca, caNo }) => batch.update(ca.ref, { ca_no: caNo }));
    await batch.commit();
    written += Math.min(400, assignments.length - i);
  }
  console.log(`\nWrote ca_no to ${written} docs.`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
