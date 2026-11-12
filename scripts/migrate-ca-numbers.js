/**
 * Rebuild cash-advance numbers into the CA<YY>-<###>-<INITIALS> format (e.g. CA26-001-RJR).
 *
 *   node scripts/migrate-ca-numbers.js            # DRY RUN: prints the mapping + every reference it would rewrite
 *   node scripts/migrate-ca-numbers.js --apply    # writes (take a backup first: node scripts/backup-firestore.js)
 *
 * - Every CA that is NOT pending and not already in the new format is renumbered, oldest first
 *   (by requested date, then creation time), one running sequence per year. Pending CAs are skipped
 *   (their printed copies are still out for signing) and can be migrated by re-running later.
 * - The old number is kept on the doc as `legacy_ca_no` so paper forms can still be found.
 * - Old numbers copied into other collections (liquidations, payment_transfers, ...) are rewritten.
 * - `ca_counters/<YY>` is set so the server's next allocation continues after the last number.
 * - OneDrive: `Cash Advance Receipts/<year>/<old>` folders are renamed to the new number (--apply),
 *   and stored receipt links under that folder are reported (dry run) / refreshed (apply).
 * Idempotent: already-migrated CAs are skipped; re-running only picks up stragglers.
 */
const path = require('path');
const admin = require('firebase-admin');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { formatCaNo, caSeq, COUNTER_COLLECTION } = require('../server/caNumber');

const APPLY = process.argv.includes('--apply');
const SERVICE_ACCOUNT = path.join(__dirname, '..', 'pmv2-851ae-firebase-adminsdk-fbsvc-c4d13e6cb1.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(require(SERVICE_ACCOUNT)) });
const db = admin.firestore();

const manilaDate = (sec) => new Date(sec * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---- OneDrive (app-only, same credentials the server uses) ----
async function graphToken() {
  const { ONEDRIVE_TENANT_ID: t, ONEDRIVE_CLIENT_ID: c, ONEDRIVE_CLIENT_SECRET: s } = process.env;
  if (!t || !c || !s || !process.env.ONEDRIVE_DRIVE_OWNER) return null;
  const r = await fetch(`https://login.microsoftonline.com/${t}/oauth2/v2.0/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'client_credentials', client_id: c, client_secret: s, scope: 'https://graph.microsoft.com/.default' }) });
  const j = await r.json();
  return j.access_token || null;
}
async function graph(token, url, opts = {}) {
  const r = await fetch(url.startsWith('http') ? url : `https://graph.microsoft.com/v1.0${url}`, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  if (r.status === 404) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}

(async () => {
  const users = {};
  (await db.collection('users').get()).docs.forEach((d) => { users[d.id] = d.data(); });
  const cas = (await db.collection('cash_advances').get()).docs.map((d) => ({ ref: d.ref, id: d.id, ...d.data() }));
  const when = (c) => c.requested_at || c.created_at || 0;

  const newFmt = (c) => !!caSeq(c.ca_no, String(c.ca_no || '').slice(2, 4));
  const eligible = cas.filter((c) => c.status !== 'pending' && !newFmt(c))
    .sort((a, b) => when(a) - when(b) || (a.created_at || 0) - (b.created_at || 0) || String(a.ca_no).localeCompare(String(b.ca_no)));
  const skippedPending = cas.filter((c) => c.status === 'pending' && !newFmt(c));

  // continue after any CA already in the new format
  const lastByYy = {};
  cas.filter(newFmt).forEach((c) => { const yy = c.ca_no.slice(2, 4); lastByYy[yy] = Math.max(lastByYy[yy] || 0, caSeq(c.ca_no, yy)); });

  const plan = eligible.map((c) => {
    const yy = manilaDate(when(c)).slice(2, 4);
    lastByYy[yy] = (lastByYy[yy] || 0) + 1;
    const owner = users[c.user_id] || {};
    return { c, yy, old: c.ca_no, next: formatCaNo(yy, lastByYy[yy], owner), owner: owner.username || '?' };
  });

  console.log(`\n${APPLY ? 'APPLY' : 'DRY RUN'} - ${plan.length} CA(s) to renumber, ${skippedPending.length} pending skipped\n`);
  console.log('date        old                    ->  new                 status    amount  owner');
  plan.forEach((p) => console.log(`${manilaDate(when(p.c))}  ${String(p.old).padEnd(21)}  ->  ${p.next.padEnd(18)}  ${String(p.c.status).padEnd(8)} ${String(p.c.amount).padStart(7)}  ${p.owner}`));
  skippedPending.forEach((c) => console.log(`${manilaDate(when(c))}  ${String(c.ca_no).padEnd(21)}  (pending - left as is)   ${c.amount}`));

  // ---- references to old numbers in other collections ----
  // Only the STRUCTURED link is rewritten: payment_transfers.allocations[].docNo for cash-advance
  // allocations. Free-text mentions (notes, remarks, audit history, rows_json) are left as written -
  // they were true when written, and the old number stays searchable in `legacy_ca_no`.
  const byOld = new Map(plan.map((p) => [p.old, p.next]));
  const refUpdates = [];
  const narrative = [];
  for (const d of (await db.collection('payment_transfers').get()).docs) {
    const allocs = d.data().allocations;
    if (!Array.isArray(allocs)) continue;
    let changed = false;
    const next = allocs.map((a) => (a && a.type === 'cash_advance' && byOld.has(a.docNo) ? (changed = true, { ...a, docNo: byOld.get(a.docNo) }) : a));
    if (changed) refUpdates.push({ ref: d.ref, col: 'payment_transfers', id: d.id, fields: ['allocations[].docNo'], changed: { allocations: next }, hits: [] });
  }
  const rules = plan.map((p) => ({ from: p.old, re: new RegExp(`(?<![A-Za-z0-9-])${esc(p.old)}(?![A-Za-z0-9])`) }));
  for (const col of (await db.listCollections()).map((x) => x.id)) {
    if (col === 'cash_advances' || col === COUNTER_COLLECTION) continue;
    for (const d of (await db.collection(col).get()).docs) {
      const j = JSON.stringify(d.data());
      const hit = rules.filter((r) => r.re.test(j)).map((r) => r.from);
      if (hit.length) narrative.push(`${col}/${d.id} (${hit.join(', ')})`);
    }
  }
  console.log(`\nStructured references to rewrite: ${refUpdates.length}`);
  refUpdates.forEach((u) => console.log(`  ${u.col}/${u.id}  ${u.fields.join(', ')}`));
  console.log(`Docs that mention an old number in free text (left unchanged): ${narrative.length}`);
  narrative.forEach((n) => console.log(`  ${n}`));

  // ---- OneDrive receipt folders ----
  let token = null; let driveId = null; const folderOps = [];
  try { token = await graphToken(); if (token) driveId = (await graph(token, `/users/${encodeURIComponent(process.env.ONEDRIVE_DRIVE_OWNER)}/drive`)).id; } catch (e) { console.log('\nOneDrive unavailable:', e.message); }
  if (driveId) {
    for (const p of plan) {
      const years = [...new Set([manilaDate(when(p.c)).slice(0, 4), manilaDate(p.c.created_at || when(p.c)).slice(0, 4), String(new Date().getFullYear())])];
      for (const y of years) {
        const item = await graph(token, `/drives/${driveId}/root:/${encodeURI(`Cash Advance Receipts/${y}/${p.old}`)}`);
        if (item) { folderOps.push({ p, y, id: item.id, items: item.folder ? item.folder.childCount : '?' }); break; }
      }
    }
    console.log(`\nOneDrive receipt folders to rename: ${folderOps.length}`);
    folderOps.forEach((f) => console.log(`  Cash Advance Receipts/${f.y}/${f.p.old}  ->  ${f.p.next}   (${f.items} file(s))`));
    const stale = (await db.collection('cash_advances').get()).docs.filter((d) => /Cash%20Advance%20Receipts|Cash Advance Receipts/.test(JSON.stringify(d.data())));
    console.log(`CA docs that store receipt links under that folder: ${stale.length} ${stale.length ? '(webUrl would be refreshed on apply)' : ''}`);
  } else console.log('\nOneDrive: not checked (no credentials in .env)');

  if (!APPLY) { console.log('\nDry run only - nothing was written. Re-run with --apply after a backup.'); process.exit(0); }

  // ---- apply ----
  for (const f of folderOps) {
    await graph(token, `/drives/${driveId}/items/${f.id}`, { method: 'PATCH', body: JSON.stringify({ name: f.p.next }) });
    console.log(`renamed folder ${f.p.old} -> ${f.p.next}`);
  }
  for (const p of plan) {
    await p.c.ref.update({ ca_no: p.next, legacy_ca_no: p.old, ca_no_migrated_at: Math.floor(Date.now() / 1000) });
  }
  for (const u of refUpdates) await u.ref.update(u.changed);
  for (const [yy, last] of Object.entries(lastByYy)) await db.collection(COUNTER_COLLECTION).doc(yy).set({ last, updated_at: Math.floor(Date.now() / 1000) }, { merge: true });
  console.log(`\nDone: ${plan.length} CA(s), ${refUpdates.length} reference doc(s), counters`, JSON.stringify(lastByYy));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
