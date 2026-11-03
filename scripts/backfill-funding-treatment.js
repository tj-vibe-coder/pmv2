/**
 * Adds `fundingSource.treatment` to records saved before it existed
 * (server/fundingSource.js, 2026-11-03). RJ decided every existing
 * investor_outofpocket record is capital, so the mapping is direct:
 *   investor_outofpocket -> equity_contribution
 *   corporate_bank       -> company_funded
 * Only the `treatment` field is written; `type`, investors, links, amounts and
 * timestamps are left as they are, and nothing in `investments` changes.
 *
 * Usage (from the repo root):
 *   node scripts/backfill-funding-treatment.js           # dry run: counts only
 *   node scripts/backfill-funding-treatment.js --apply   # writes
 */
const path = require('path');
const admin = require('firebase-admin');
const { treatmentOf } = require('../server/fundingSource');

const APPLY = process.argv.includes('--apply');
const COLLECTIONS = ['project_expenses', 'overhead_expenses', 'cash_advances', 'payroll_runs', 'reimbursements', 'reimbursement_payments'];

admin.initializeApp({ credential: admin.credential.cert(require(path.join(process.cwd(), 'pmv2-851ae-firebase-adminsdk-fbsvc-c4d13e6cb1.json'))) });
const db = admin.firestore();

async function main() {
  console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN (pass --apply to write) ===');
  const equityByInvestor = {};
  let toWrite = 0;
  for (const name of COLLECTIONS) {
    const snap = await db.collection(name).get();
    const counts = { already: 0, company_funded: 0, equity_contribution: 0 };
    const pending = [];
    for (const doc of snap.docs) {
      const fs = doc.data().fundingSource;
      if (!fs || typeof fs !== 'object') continue;
      if (fs.treatment) { counts.already++; continue; }
      const treatment = treatmentOf(fs);
      counts[treatment]++;
      pending.push({ ref: doc.ref, treatment });
      if (treatment === 'equity_contribution') {
        const who = fs.investor || '(no investor)';
        const amount = Number(doc.data().amount) || 0;
        equityByInvestor[who] = equityByInvestor[who] || { rows: 0, amount: 0 };
        equityByInvestor[who].rows++;
        equityByInvestor[who].amount += amount;
      }
    }
    console.log(`${name}: ${snap.size} docs; already set ${counts.already}; to mark company_funded ${counts.company_funded}, equity_contribution ${counts.equity_contribution}`);
    toWrite += pending.length;
    if (APPLY) {
      for (let i = 0; i < pending.length; i += 400) {
        const batch = db.batch();
        pending.slice(i, i + 400).forEach(({ ref, treatment }) => batch.update(ref, { 'fundingSource.treatment': treatment }));
        await batch.commit();
      }
    }
  }
  console.log('\nRecords to be marked as capital, by investor (record amounts, not the investment ledger):');
  for (const [who, v] of Object.entries(equityByInvestor)) console.log(`  ${who}: ${v.rows} record(s), PHP ${v.amount.toFixed(2)}`);
  console.log(APPLY ? `\nWrote treatment on ${toWrite} record(s).` : `\n${toWrite} record(s) would be updated. Nothing was written.`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
