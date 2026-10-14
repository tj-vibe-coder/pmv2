'use strict';
// Offline plan first. Database operations are deliberately restricted to a local emulator.
const fs = require('node:fs');
const evidence = require('../../server/financeEvidence');
const { createHash } = require('node:crypto');
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
const fingerprint = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
function plan(snapshot) {
  if (!Array.isArray(snapshot.invoices)) throw new Error('Snapshot must contain invoices[] with IDs');
  if (new Set(snapshot.invoices.map(inv => inv.id)).size !== snapshot.invoices.length) throw new Error('Duplicate source invoice ID');
  const writes = new Map(); const skipped = [];
  for (const invoice of snapshot.invoices) {
    evidence.id(invoice.id);
    if (!invoice.scan_file?.onedrive_web_url) continue;
    const legacy = evidence.legacyDocument(invoice);
    if (!legacy) { skipped.push({ id: invoice.id, reason: 'Invalid legacy URL; repair manually' }); continue; }
    const { id, legacy: _legacy, type: _type, source: _source, ...document } = legacy;
    const now = snapshot.capturedAt || '2026-10-14T00:00:00.000Z';
    const doc = { ...document, revision: 1, uploadedBy: 'migration:001', uploadedAt: now };
    writes.set(`finance_documents/${id}`, { path: `finance_documents/${id}`, before: null, after: doc });
    const link = { invoiceId: invoice.id, documentId: id, entityType: 'invoice', type: 'supporting_pack', source: 'legacy scan_file (contents not classified)',
      reference: '', documentDate: '', active: true, revision: 1, linkedBy: 'migration:001', linkedAt: now };
    const path = `finance_document_links/${evidence.linkId(invoice.id, id, 'supporting_pack')}`;
    writes.set(path, { path, before: null, after: link });
  }
  return { version: '001-invoice-evidence', baseline: fingerprint(snapshot), sourceInvoices: snapshot.invoices,
    financialBaseline: Object.fromEntries(['invoices', 'reimbursements', 'reimbursement_payments', 'cash_advances', 'investments'].filter(k => snapshot[k]).map(k => [k, fingerprint(snapshot[k])])),
    totalsCentavos: {
      billed: snapshot.invoices.reduce((sum, inv) => sum + Math.round((Number(inv.amount) || 0) * 100), 0),
      cash: snapshot.invoices.reduce((sum, inv) => sum + Math.round((Number(inv.amount_collected) || 0) * 100), 0),
      wht: snapshot.invoices.reduce((sum, inv) => sum + Math.round((Number(inv.wht_amount) || 0) * 100), 0),
      outstanding: snapshot.invoices.reduce((sum, inv) => sum + Math.max(0, Math.round(((Number(inv.amount) || 0) - (Number(inv.amount_collected) || 0) - (Number(inv.wht_amount) || 0)) * 100)), 0),
      reimbursementPaid: (snapshot.reimbursements || []).reduce((sum, r) => sum + Math.round((r.status === 'paid' ? Number(r.amount) || 0 : Number(r.paidAmount) || 0) * 100), 0),
      caRemaining: (snapshot.cash_advances || []).reduce((sum, ca) => sum + Math.round((Number(ca.balance_remaining) || 0) * 100), 0),
      investments: (snapshot.investments || []).reduce((sum, inv) => sum + Math.round((Number(inv.amount) || 0) * 100), 0),
    }, writes: [...writes.values()], skipped };
}
async function apply(db, manifest, rollback = false) {
  if (manifest.version !== '001-invoice-evidence') throw new Error('Unexpected manifest version');
  // A bounded transaction keeps source checks and all evidence changes atomic.
  if (manifest.writes.length > 180 || manifest.sourceInvoices.length > 100) throw new Error('Split snapshot into reviewed batches (max 100 invoices / 180 writes)');
  for (const write of manifest.writes) {
    if (!/^(finance_documents|finance_document_links)\/[a-f0-9]{64}$/.test(write.path) || write.before !== null) throw new Error('Invalid evidence-only migration write');
  }
  return db.runTransaction(async tx => {
    for (const inv of manifest.sourceInvoices) {
      const snap = await tx.get(db.collection('invoices').doc(evidence.id(inv.id)));
      const { id: _id, ...before } = inv;
      if (!snap.exists || fingerprint(snap.data()) !== fingerprint(before)) throw new Error(`Source precondition failed: ${inv.id}`);
    }
    const targets = [];
    for (const write of manifest.writes) {
      const [collection, id] = write.path.split('/'); const ref = db.collection(collection).doc(id);
      const snap = await tx.get(ref);
      if (snap.exists && fingerprint(snap.data()) !== fingerprint(write.after)) throw new Error(`Evidence precondition failed: ${write.path}`);
      targets.push({ write, ref, exists: snap.exists });
    }
    // Keep shared metadata whenever any retained link (including an unlinked
    // history marker) references it. Query in the transaction so a concurrent
    // runtime link cannot race the rollback's document deletion.
    const retainedSharedDocuments = new Set();
    if (rollback) {
      const removableLinks = new Set(targets.filter(t => t.exists && t.write.path.startsWith('finance_document_links/')).map(t => t.ref.id));
      for (const target of targets.filter(t => t.exists && t.write.path.startsWith('finance_documents/'))) {
        const references = await tx.get(db.collection('finance_document_links').where('documentId', '==', target.ref.id).limit(181));
        if (references.docs.some(link => !removableLinks.has(link.id))) retainedSharedDocuments.add(target.ref.id);
      }
    }
    for (const { write, ref, exists } of targets) {
      if (rollback && retainedSharedDocuments.has(ref.id) && write.path.startsWith('finance_documents/')) continue;
      if (rollback && exists) tx.delete(ref);
      if (!rollback && !exists) tx.set(ref, write.after);
      if ((rollback && exists) || (!rollback && !exists)) tx.set(ref.collection('history').doc(rollback ? 'migration-001-rollback' : 'migration-001'), {
        actor: 'migration:001', at: new Date().toISOString(), before: rollback ? write.after : null, after: rollback ? null : write.after,
        reason: rollback ? 'Compensating metadata rollback; original file retained' : 'Reviewed legacy scan backfill', baseline: manifest.baseline,
      });
    }
    return { retainedSharedDocuments: [...retainedSharedDocuments] };
  });
}
async function main() {
  const args = process.argv.slice(2); const arg = key => args[args.indexOf(key) + 1];
  if (!args.includes('--snapshot') || !args.includes('--manifest')) throw new Error('Use --snapshot snapshot.json --manifest manifest.json (dry-run default); --apply/--rollback require local emulator');
  const snapshot = JSON.parse(fs.readFileSync(arg('--snapshot'), 'utf8'));
  const proposed = plan(snapshot);
  if (!args.includes('--apply') && !args.includes('--rollback')) {
    fs.writeFileSync(arg('--manifest'), JSON.stringify(proposed, null, 2) + '\n', { flag: 'wx' });
    console.log(`DRY RUN: ${proposed.writes.length} evidence writes; ${proposed.skipped.length} manual-review skips; no financial changes. Manifest saved.`); return;
  }
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Apply/rollback is local-emulator-only; production operations are not authorized');
  const manifest = JSON.parse(fs.readFileSync(arg('--manifest'), 'utf8'));
  if (fingerprint(manifest) !== fingerprint(proposed)) throw new Error('Manifest differs from current dry-run plan');
  const admin = require('firebase-admin'); admin.initializeApp({ projectId: 'demo-finance-evidence' });
  const result = await apply(admin.firestore(), manifest, args.includes('--rollback'));
  if (result.retainedSharedDocuments.length) console.log('Shared documents retained for links outside this manifest:', result.retainedSharedDocuments.join(', '));
  console.log(args.includes('--rollback') ? 'Emulator metadata rollback complete' : 'Emulator apply complete; financial source records unchanged');
  await admin.app().delete();
}
if (require.main === module) main().catch(err => { console.error(err.message); process.exitCode = 1; });
module.exports = { plan, apply, fingerprint };
