'use strict';
// Targeted OFFLINE planner. Apply only through the authenticated, hash-guarded
// per-form initialize endpoint; this script never connects to a database.
const fs = require('node:fs');
const { physicalNumbering } = require('../../server/liquidationItemNumbers');
const { receiptReviewHash } = require('../../server/liquidationReceiptReview');
function plan(snapshot, ids) {
  const records = Array.isArray(snapshot.liquidations) ? snapshot.liquidations : snapshot.id ? [snapshot] : [];
  if (!ids?.length || new Set(ids).size !== ids.length) throw new Error('Explicit unique liquidation IDs required; no broad backfill');
  return { version: '004-physical-item-numbers', mode: 'targeted-dry-run', operations: ids.map(id => {
    const liq = records.find(record => record.id === id);
    if (!liq) throw new Error(`Missing snapshot for ${id}`);
    if (liq.pending_revision) throw new Error(`Resolve pending revision before initializing ${id}`);
    const numbering = physicalNumbering(liq);
    return { id, formNo: liq.form_no, alreadyInitialized: !!liq.physical_item_numbering,
      endpoint: `/api/liquidations/${encodeURIComponent(id)}/item-numbering/initialize`,
      body: { expectedContentHash: receiptReviewHash(liq), expectedItemNumbers: numbering.numbers },
      policy: 'Persist only the verified physical numbering ledger and its audit; no row/date/receipt/amount/status writes.' };
  }) };
}
function main() {
  const args = process.argv.slice(2); const value = key => args[args.indexOf(key) + 1];
  if (args.includes('--apply') || args.includes('--rollback')) throw new Error('No database apply/backfill: use the reviewed per-form initialization endpoint');
  if (!args.includes('--snapshot') || !args.includes('--manifest')) throw new Error('Use --snapshot file --manifest file --liquidation-id ID (dry-run only)');
  const ids = args.flatMap((arg, index) => arg === '--liquidation-id' ? [args[index + 1]] : []);
  const manifest = plan(JSON.parse(fs.readFileSync(value('--snapshot'), 'utf8')), ids);
  fs.writeFileSync(value('--manifest'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log('DRY RUN: verified targeted metadata-only initialization contract; no database connection/writes.');
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { plan };
