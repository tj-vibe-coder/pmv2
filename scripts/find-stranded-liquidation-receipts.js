/**
 * REPORT ONLY. Finds receipt files under OneDrive `Liquidation Receipts/<year>/`
 * that no liquidation links to, and suggests which liquidation row each one
 * belongs to. Writes nothing to Firestore or OneDrive.
 *
 * Why: before the 2026-11 save guards, a save could drop a form's receipt list
 * while the files stayed in OneDrive, often in a folder named after the form's
 * preview number (e.g. LQ26-024-TJC's receipts sat in `LQ26-022-TJC/`).
 *
 * Matching uses the file name written by makeLiquidationReceiptFilename:
 *   <formNo>[_Item-<N>]_<YYYY-MM-DD>_<particulars>_rcpt-<id>.<ext>
 * A candidate liquidation belongs to the same person (initials suffix of the
 * form number) and has a row with that physical item number and date. Every
 * suggestion needs RJ's approval before anything is linked.
 *
 * Usage:
 *   node scripts/find-stranded-liquidation-receipts.js [--year 2026] [--out report.json]
 * Needs ONEDRIVE_TENANT_ID / _CLIENT_ID / _CLIENT_SECRET / _DRIVE_OWNER in .env
 * and the service account JSON in the repo root.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const YEAR = arg('--year', String(new Date().getFullYear()));
const OUT = arg('--out', null);

const keyPath = path.join(process.cwd(), 'pmv2-851ae-firebase-adminsdk-fbsvc-c4d13e6cb1.json');
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();

async function graphToken() {
  const { ONEDRIVE_TENANT_ID: tenant, ONEDRIVE_CLIENT_ID: id, ONEDRIVE_CLIENT_SECRET: secret } = process.env;
  if (!tenant || !id || !secret || !process.env.ONEDRIVE_DRIVE_OWNER) throw new Error('OneDrive env vars missing (see header)');
  const resp = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret, scope: 'https://graph.microsoft.com/.default' }),
  });
  const body = await resp.json();
  if (!resp.ok) throw new Error(`Graph token: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function graphGet(token, url) {
  const resp = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw Object.assign(new Error(`${resp.status} ${url}: ${JSON.stringify(body)}`), { status: resp.status });
  return body;
}

async function listChildren(token, url) {
  const items = [];
  for (let next = url; next;) {
    const page = await graphGet(token, next);
    items.push(...(page.value || []));
    next = page['@odata.nextLink'];
  }
  return items;
}

const parseList = (v) => {
  if (Array.isArray(v)) return v;
  try { const p = JSON.parse(v || '[]'); return Array.isArray(p) ? p : []; } catch (_) { return []; }
};

// Same physical item numbers the liquidation page shows (falls back to stored rows).
const itemNumbers = require('../server/liquidationItemNumbers');
const rowsWithItemNumbers = (d) => {
  try { return itemNumbers.numberedRows(d); } catch (_) { return parseList(d.rows_json); }
};

// <formNo>[_Item-<N>]_<YYYY-MM-DD>_...
function parseReceiptName(name) {
  const m = /^(LQ\d{2}-\d{3}-([A-Z]+))(?:_Item-(\d+))?_(\d{4}-\d{2}-\d{2}|undated)_/.exec(name);
  if (!m) return null;
  return { formNo: m[1], initials: m[2], itemNo: m[3] ? Number(m[3]) : null, date: m[4] };
}

async function main() {
  const token = await graphToken();
  const owner = process.env.ONEDRIVE_DRIVE_OWNER;
  const drive = await graphGet(token, `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(owner)}/drive`);
  const root = `https://graph.microsoft.com/v1.0/drives/${drive.id}`;
  const yearPath = encodeURIComponent(`Liquidation Receipts/${YEAR}`).replace(/%2F/g, '/');
  const folders = (await listChildren(token, `${root}/root:/${yearPath}:/children?$top=200`)).filter((i) => i.folder);

  // Every OneDrive id any liquidation (or its pending edit) or expense links to.
  const referenced = new Set();
  const liquidations = [];
  for (const doc of (await db.collection('liquidations').get()).docs) {
    const d = doc.data();
    for (const r of parseList(d.receipts_json)) if (r && r.oneDriveId) referenced.add(String(r.oneDriveId));
    if (d.pending_revision) for (const r of parseList(d.pending_revision.receipts_json)) if (r && r.oneDriveId) referenced.add(String(r.oneDriveId));
    liquidations.push({ id: doc.id, form_no: d.form_no || null, status: d.status, user_id: d.user_id, rows: rowsWithItemNumbers(d), receiptCount: parseList(d.receipts_json).length });
  }
  for (const coll of ['project_expenses', 'overhead_expenses']) {
    for (const doc of (await db.collection(coll).get()).docs) {
      const ref = doc.data().receiptRef;
      if (ref && ref.oneDriveId) referenced.add(String(ref.oneDriveId));
    }
  }

  const stranded = [];
  for (const folder of folders) {
    const files = (await listChildren(token, `${root}/items/${folder.id}/children?$top=200`)).filter((i) => i.file);
    for (const f of files) {
      if (referenced.has(f.id)) continue;
      const parsed = parseReceiptName(f.name);
      const candidates = !parsed ? [] : liquidations
        .filter((l) => l.form_no && l.form_no.endsWith(`-${parsed.initials}`))
        .map((l) => {
          const row = l.rows.find((r) => (parsed.itemNo == null || r.physicalItemNo === parsed.itemNo) && r.date === parsed.date);
          return row ? { liquidationId: l.id, form_no: l.form_no, status: l.status, rowId: row.id, physicalItemNo: row.physicalItemNo, particulars: row.particulars, amount: row.amount, liquidationReceiptCount: l.receiptCount } : null;
        })
        .filter(Boolean);
      stranded.push({ folder: folder.name, name: f.name, oneDriveId: f.id, webUrl: f.webUrl, created: f.createdDateTime, parsed, candidates });
    }
  }

  // Per folder + candidate form, how many stranded files point at it.
  const summary = {};
  for (const s of stranded) {
    const key = s.folder;
    summary[key] = summary[key] || { files: 0, unmatched: 0, byForm: {} };
    summary[key].files++;
    if (!s.candidates.length) summary[key].unmatched++;
    for (const c of s.candidates) summary[key].byForm[c.form_no] = (summary[key].byForm[c.form_no] || 0) + 1;
  }

  const report = { generatedAt: new Date().toISOString(), year: YEAR, foldersScanned: folders.length, strandedFiles: stranded.length, summary, stranded };
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`Scanned ${folders.length} folder(s) under Liquidation Receipts/${YEAR}; ${stranded.length} file(s) not linked anywhere.`);
  for (const [folder, s] of Object.entries(summary)) {
    const forms = Object.entries(s.byForm).map(([f, n]) => `${f} (${n})`).join(', ') || 'none';
    console.log(`  ${folder}: ${s.files} file(s), ${s.unmatched} with no matching row; candidate forms: ${forms}`);
  }
  if (OUT) console.log(`Full report: ${OUT}`);
  console.log('Report only. Nothing was linked or moved.');
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
