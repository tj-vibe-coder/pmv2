/**
 * Split historical invoice cash vs customer EWT (BIR 2307).
 *
 * Leaves invoices paid: cash + WHT = original billed amount.
 * Does NOT mark 2307 as received — journal is amount provenance only.
 *
 * Usage:
 *   node scripts/backfill-invoice-wht.js            # dry run
 *   node scripts/backfill-invoice-wht.js --apply    # write
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

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
const APPLY = process.argv.includes('--apply');

/** Sales journal rows RJ provided 2026-08-27. Match by invoice_no. */
const JOURNAL = [
  {
    invoice_no: 'SOA-2603-011',
    also: ['001'],
    amount: 256158,
    wht: 2561.58,
    rate: 1,
    source: 'sales-journal-2026 SI 001 ACTI Lear MES',
  },
  {
    invoice_no: '004',
    amount: 15000,
    wht: 300,
    rate: 2,
    source: 'sales-journal-2026 SI 004 LBI',
  },
  {
    invoice_no: '007',
    amount: 15000,
    wht: 750,
    rate: 5,
    source: 'sales-journal-2026 SI 007 Smartech/Mondelez',
  },
];

function php(n) {
  return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

(async () => {
  const snap = await db.collection('invoices').get();
  const docs = snap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));
  const updates = [];
  const missing = [];

  for (const row of JOURNAL) {
    const aliases = [row.invoice_no, ...(row.also || [])].map((s) => String(s).trim());
    const match = docs.find((d) => aliases.includes(String(d.invoice_no || '').trim()));
    if (!match) {
      missing.push(row.invoice_no);
      continue;
    }
    const billed = Number(match.amount) || 0;
    if (Math.abs(billed - row.amount) > 0.05) {
      missing.push(`${row.invoice_no} amount mismatch billed=${billed} journal=${row.amount}`);
      continue;
    }
    const cash = Math.round((row.amount - row.wht) * 100) / 100;
    updates.push({
      id: match.id,
      invoice_no: match.invoice_no,
      fromCash: Number(match.amount_collected) || 0,
      toCash: cash,
      wht: row.wht,
      rate: row.rate,
      source: row.source,
      already: Number(match.wht_amount) > 0,
    });
  }

  console.log(APPLY ? 'APPLY' : 'DRY RUN');
  for (const u of updates) {
    console.log(
      `${String(u.invoice_no).padEnd(16)} cash ${php(u.fromCash)} → ${php(u.toCash)}  EWT ${php(u.wht)} (${u.rate}%)  ${u.already ? 'already had WHT' : 'new'}`,
    );
  }
  if (missing.length) console.log('Unmatched:', missing);

  if (!APPLY) {
    console.log('\nRe-run with --apply to write.');
    process.exit(0);
  }

  const now = new Date().toISOString();
  for (const u of updates) {
    await db.collection('invoices').doc(u.id).update({
      amount_collected: u.toCash,
      wht_amount: u.wht,
      wht_rate_pct: u.rate,
      wht_2307_status: 'expected',
      wht_source: u.source,
      updated_at: now,
    });
  }
  console.log(`Wrote ${updates.length} invoice(s).`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
