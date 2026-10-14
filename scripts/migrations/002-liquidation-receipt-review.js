'use strict';
// Additive, write-on-first-review schema: never infer attestations from old forms.
const fs = require('node:fs');
const { fingerprint } = require('./001-invoice-evidence');
function plan(snapshot) {
  if (!Array.isArray(snapshot.liquidations)) throw new Error('Snapshot must contain liquidations[]');
  return { version: '002-liquidation-receipt-review', baseline: fingerprint(snapshot), writes: [],
    submittedForms: snapshot.liquidations.filter(row => row.status === 'submitted').map(row => row.id),
    policy: 'Absent reviews remain not_reviewed; only deliberate authenticated review actions create attestations.' };
}
function main() {
  const args = process.argv.slice(2); const arg = key => args[args.indexOf(key) + 1];
  if (!args.includes('--snapshot') || !args.includes('--manifest')) throw new Error('Use --snapshot snapshot.json --manifest manifest.json (dry-run default)');
  const proposed = plan(JSON.parse(fs.readFileSync(arg('--snapshot'), 'utf8')));
  if (args.includes('--apply') || args.includes('--rollback')) {
    const manifest = JSON.parse(fs.readFileSync(arg('--manifest'), 'utf8'));
    if (fingerprint(manifest) !== fingerprint(proposed)) throw new Error('Reviewed manifest precondition failed');
    console.log('NO-OP: no historical reviews are created, changed or deleted. No database connection opened.');
  } else {
    fs.writeFileSync(arg('--manifest'), JSON.stringify(proposed, null, 2) + '\n', { flag: 'wx' });
    console.log(`DRY RUN: ${proposed.submittedForms.length} submitted forms; zero backfill writes. Existing history is preserved.`);
  }
}
if (require.main === module) { try { main(); } catch (err) { console.error(err.message); process.exitCode = 1; } }
module.exports = { plan };
