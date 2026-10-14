'use strict';
// Additive schema only; historical physical submissions/RJ reviews are unknown.
const fs = require('node:fs');
const { fingerprint } = require('./001-invoice-evidence');
function plan(snapshot) {
  if (!Array.isArray(snapshot.liquidations) || !Array.isArray(snapshot.reimbursements)) throw new Error('Snapshot requires liquidations[] and reimbursements[]');
  return { version: '003-physical-receipt-workflow', baseline: fingerprint(snapshot), writes: [],
    legacyPaidCount: snapshot.reimbursements.filter(r => r.status === 'paid').length,
    policy: 'Keep paid history; never infer physical submission/RJ review. New workflow, return-name snapshots and urgent-exception metadata are populated by explicit actions.' };
}
function main() {
  const args = process.argv.slice(2); const arg = key => args[args.indexOf(key) + 1];
  if (!args.includes('--snapshot') || !args.includes('--manifest')) throw new Error('Use --snapshot snapshot.json --manifest manifest.json (dry-run default)');
  const proposed = plan(JSON.parse(fs.readFileSync(arg('--snapshot'), 'utf8')));
  if (args.includes('--apply') || args.includes('--rollback')) {
    if (fingerprint(JSON.parse(fs.readFileSync(arg('--manifest'), 'utf8'))) !== fingerprint(proposed)) throw new Error('Reviewed manifest precondition failed');
    console.log('NO-OP: historical payments and receipt history unchanged; no database connection.');
  } else { fs.writeFileSync(arg('--manifest'), JSON.stringify(proposed, null, 2) + '\n', { flag: 'wx' }); console.log('DRY RUN: zero historical writes; paid history preserved.'); }
}
if (require.main === module) { try { main(); } catch (err) { console.error(err.message); process.exitCode = 1; } }
module.exports = { plan };
