'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const express = require('express');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { after } = require('node:test');
// Prepare an isolated Functions bundle; never overwrite the checked-in API copy.
const packaged = fs.mkdtempSync(path.join(process.cwd(), '.finance-evidence-package-'));
fs.mkdirSync(path.join(packaged, 'server')); fs.mkdirSync(path.join(packaged, 'scripts'));
fs.copyFileSync('scripts/prepare-functions.js', path.join(packaged, 'scripts/prepare-functions.js'));
fs.copyFileSync('functions/server.js', path.join(packaged, 'server.js'));
for (const name of ['financeEvidence.js', 'financeEvidenceRouter.js']) fs.copyFileSync(`server/${name}`, path.join(packaged, 'server', name));
execFileSync(process.execPath, ['scripts/prepare-functions.js'], { cwd: packaged });
after(() => fs.rmSync(packaged, { recursive: true, force: true }));
const { FinanceFirestore } = require('./test-support/financeFirestore');
const { documentInput } = require('./financeEvidence');
const { plan, apply, fingerprint } = require('../scripts/migrations/001-invoice-evidence');
const invoices = () => ({
  si008: { invoice_no: 'SI008', project_id: 'adi', bill_to_name: 'ACTI', amount: 193414.05, amount_collected: 185677.49, wht_amount: 7736.56, collection_date: '2026-09-10', wht_2307_status: 'received', scan_file: { onedrive_web_url: 'https://example.com/pack008.pdf', filename: 'pack008.pdf', onedrive_item_id: 'old008' } },
  si010: { invoice_no: 'SI010', project_id: 'other', bill_to_name: 'ACTI', amount: 144086.75, amount_collected: 0 },
  si011: { invoice_no: 'SI011', bill_to_name: 'ACTI', amount: 300000, amount_collected: 294642.86, wht_amount: 5357.14 },
  si012: { invoice_no: 'SI012', bill_to_name: 'ACTI', amount: 180000, amount_collected: 176785.71, wht_amount: 3214.29 },
  si013: { invoice_no: 'SI013', bill_to_name: 'ACTI', amount: 30000, amount_collected: 29464.29, wht_amount: 535.71 },
});
const payload = (invoiceIds = ['si011'], type = 'deposit_slip') => ({ invoiceIds, type, source: 'Oct 14 audit fixture', reference: 'Shared cheque', document: { webUrl: 'https://example.com/deposit.pdf', driveId: 'drive1', itemId: 'deposit1', filename: 'deposit.pdf', mimeType: 'application/pdf', size: 1000 } });
async function setup(t, file) {
  const db = new FinanceFirestore({ invoices: invoices(), reimbursements: { old: { status: 'paid', amount: 100 } } });
  const before = fingerprint(db.store);
  const app = express(); app.use(express.json());
  const { createFinanceEvidenceRouter } = require(file === 'server.js' ? './financeEvidenceRouter' : path.join(packaged, 'functions/server/financeEvidenceRouter'));
  app.use('/evidence', createFinanceEvidenceRouter({ db, requireActiveUser: async (req, res) => {
    const role = req.headers['x-role']; if (!role || role === 'unapproved') { res.status(401).json({ error: 'Unauthorized' }); return null; }
    return { id: 'reviewer', role };
  } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(() => new Promise(r => server.close(r)));
  const request = async (path, method = 'GET', body, role = 'admin') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/evidence${path}`, { method, headers: { 'Content-Type': 'application/json', ...(role ? { 'x-role': role } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  return { db, request, before };
}
for (const file of ['server.js', 'functions/server.js']) {
  test(`${file}: invoice evidence mounts shared router`, () => {
    assert.match(fs.readFileSync(file, 'utf8'), /app.use\('\/api\/finance-evidence', require\('\.\/server\/financeEvidenceRouter'\).createFinanceEvidenceRouter\(\{ db, requireActiveUser \}\)\)/);
  });
  test(`${file}: shared slip, retry/concurrent appends, legacy pack and unpaid counter receipt leave all financial values unchanged`, async t => {
    const { db, request } = await setup(t, file); const before = structuredClone(db.store);
    const body = payload(['si011', 'si012', 'si013']);
    const first = await request('/links', 'POST', body); assert.equal(first.status, 200);
    const retry = await request('/links', 'POST', body); assert.deepEqual(retry.data, first.data);
    await Promise.all([request('/links', 'POST', { ...payload(['si008'], 'collection_receipt'), document: { webUrl: 'https://example.com/cr006.pdf', filename: 'CR006.pdf' } }), request('/links', 'POST', payload(['si008'], 'deposit_slip'))]);
    await request('/links', 'POST', payload(['si010'], 'counter_receipt'));
    for (const invoiceId of ['si011', 'si012', 'si013']) {
      const result = await request(`/invoices/${invoiceId}/documents`); assert.equal(result.data.links[0].document.id, first.data.documentId);
    }
    const legacy = await request('/invoices/si008/documents'); assert.equal(legacy.data.legacy.filename, 'pack008.pdf'); assert.equal(legacy.data.links.length, 2);
    assert.deepEqual(db.store.invoices, before.invoices); assert.deepEqual(db.store.reimbursements, before.reimbursements);
    assert.equal(db.store.invoices.si010.amount_collected, 0);
    assert.equal(db.store.invoices.si008.collection_date, '2026-09-10');
    assert.equal(Math.round(['si011', 'si012', 'si013'].reduce((s, id) => s + db.store.invoices[id].amount_collected, 0) * 100), 50089286);
    assert.equal(Object.values(db.store.finance_documents).filter(d => d.itemId === 'deposit1').length, 1);
  });
  test(`${file}: API authorization, validation, foreign records and correction conflicts`, async t => {
    const { request, db } = await setup(t, file);
    for (const role of [null, 'unapproved']) assert.equal((await request('/invoices/si008/documents', 'GET', undefined, role)).status, 401);
    for (const role of ['user', 'viewer', 'tax_filer']) assert.equal((await request('/links', 'POST', payload(), role)).status, 403);
    assert.equal((await request('/links', 'POST', payload(['missing']))).status, 404);
    for (const document of [{ filename: 'a', webUrl: 'javascript:alert(1)' }, { filename: 'a', webUrl: 'https://example.com/a', size: 26214401 }, { filename: 'a', webUrl: 'https://example.com/a', mimeType: 'text/html' }]) assert.equal((await request('/links', 'POST', { ...payload(), document })).status, 400);
    const added = await request('/links', 'POST', payload(['si008'], 'bir2307'), 'tax_filer'); assert.equal(added.status, 200);
    const link = added.data.linkIds[0];
    const saved = await request(`/links/${link}`, 'PATCH', { revision: 1, source: 'Confirmed original', reference: '2307', documentDate: '2026-10-14' }); assert.equal(saved.status, 200);
    assert.equal((await request(`/links/${link}`, 'PATCH', { revision: 1, source: 'stale' })).status, 409);
    assert.equal((await request(`/links/${link}`, 'PATCH', { revision: 2, active: false })).status, 400);
    assert.equal((await request(`/links/${link}`, 'PATCH', { revision: 2, active: false, reason: 'Wrong scan; original retained' })).status, 200);
    assert.equal(Object.keys(db.store.finance_documents).length, 1);
    assert.equal((await request(`/links/${link}/history`)).data.length, 3);
  });
  test(`${file}: printed 2307 discrepancies and allocations preserve actual WHT and received history`, async t => {
    const { request, db } = await setup(t, file); const before = structuredClone(db.store.invoices);
    const added = await request('/links', 'POST', payload(['si008'], 'bir2307'));
    const docId = added.data.documentId;
    const certificate = { revision: 1, certificateNumber: 'cert008', periodStart: '2026-09-01', periodEnd: '2026-09-30', printedIncomeCentavos: 17269113, printedWhtCentavos: 773656,
      printedAtc: 'WC158', printedDescription: 'Local Supplier of Goods', observedCalculation: 'Printed base at 2% or 4% does not reconcile', reviewState: 'discrepancy', reviewNote: '', reviewFlags: ['base/rate mismatch', 'goods versus engineering services'], allocations: [{ invoiceId: 'si008', whtCentavos: 773656 }] };
    assert.equal((await request(`/documents/${docId}/certificate`, 'PUT', certificate, 'tax_filer')).status, 200);
    assert.equal((await request(`/documents/${docId}/certificate`, 'PUT', { ...certificate, revision: 2, reviewState: 'resolved' })).status, 400);
    assert.equal((await request(`/documents/${docId}/certificate`, 'PUT', { ...certificate, revision: 2, reviewState: 'matched' })).status, 400);
    assert.equal((await request(`/documents/${docId}/certificate`, 'PUT', { ...certificate, revision: 2, reviewState: 'resolved', reviewNote: 'Reviewed with ACTI; actual withholding retained' })).status, 200);
    assert.deepEqual(db.store.invoices, before);
    const history = await request(`/documents/${docId}/history`); assert.equal(history.data.length, 3);
    assert.equal((await request(`/links/${added.data.linkIds[0]}`, 'PATCH', { revision: 3, active: false, reason: 'test' })).status, 400);
  });
  test(`${file}: retired zero allocations can be matched without reactivating removed evidence`, async t => {
    const { request, db } = await setup(t, file);
    const added = await request('/links', 'POST', payload(['si011', 'si012'], 'bir2307'));
    const docId = added.data.documentId;
    const cert = { revision: 1, periodStart: '2026-10-01', periodEnd: '2026-10-31', printedIncomeCentavos: 42857143, printedWhtCentavos: 857143,
      reviewState: 'discrepancy', reviewFlags: [], allocations: [{ invoiceId: 'si011', whtCentavos: 535714 }, { invoiceId: 'si012', whtCentavos: 321429 }] };
    assert.equal((await request(`/documents/${docId}/certificate`, 'PUT', cert)).status, 200);
    const corrected = { ...cert, revision: 2, printedWhtCentavos: 535714, allocations: [{ invoiceId: 'si011', whtCentavos: 535714 }, { invoiceId: 'si012', whtCentavos: 0 }] };
    assert.equal((await request(`/documents/${docId}/certificate`, 'PUT', corrected)).status, 200);
    const retiredLink = added.data.linkIds[1];
    assert.equal((await request(`/links/${retiredLink}`, 'PATCH', { revision: 3, active: false, reason: 'Allocation moved to another certificate' })).status, 200);
    // A retired invoice's later counterparty correction cannot constrain this certificate.
    db.store.invoices.si012.bill_to_name = 'Different counterparty';
    const before = fingerprint(db.store.invoices);
    assert.equal((await request(`/documents/${docId}/certificate`, 'PUT', { ...corrected, revision: 3, reviewState: 'matched' })).status, 200);
    assert.equal(db.store.finance_documents[docId].certificate.reviewState, 'matched');
    assert.equal(db.store.finance_document_links[retiredLink].active, false);
    assert.equal(fingerprint(db.store.invoices), before);
    const history = await request(`/documents/${docId}/history`);
    assert.ok(history.data.some(e => e.after?.certificate?.allocations.some(a => a.invoiceId === 'si012' && a.whtCentavos === 321429)));
    assert.equal((await request(`/documents/${docId}/certificate`, 'PUT', { ...corrected, revision: 4, allocations: [corrected.allocations[0]] })).status, 400);
  });
  test(`${file}: migration rollback keeps shared metadata used by later runtime links`, async t => {
    const { request, db } = await setup(t, file);
    const manifest = plan({ invoices: [{ ...db.store.invoices.si008, id: 'si008' }] });
    const documentId = manifest.writes.find(w => w.path.startsWith('finance_documents/')).path.split('/')[1];
    const before = fingerprint(db.store.invoices);
    await apply(db, manifest);
    assert.equal((await request('/links', 'POST', { invoiceIds: ['si010'], documentId, type: 'supporting_pack', source: 'Later runtime link' })).status, 200);
    const result = await apply(db, manifest, true);
    assert.deepEqual(result.retainedSharedDocuments, [documentId]);
    assert.equal((await request('/invoices/si010/documents')).status, 200);
    assert.equal((await request('/invoices/si010/documents')).data.links[0].document.id, documentId);
    await apply(db, manifest, true);
    assert.equal(fingerprint(db.store.invoices), before);
  });
  test(`${file}: multi-invoice certificate totals and matched review enforce booked WHT`, async t => {
    const { request, db } = await setup(t, file);
    const added = await request('/links', 'POST', payload(['si011', 'si012', 'si013'], 'bir2307'));
    const cert = { revision: 1, certificateNumber: 'shared fixture', periodStart: '2026-10-01', periodEnd: '2026-10-31', printedIncomeCentavos: 45535714, printedWhtCentavos: 910714, printedAtc: 'WC158', printedDescription: 'Goods', observedCalculation: 'Sales / 1.12 × 2%', reviewState: 'discrepancy', reviewNote: 'Engineering invoices; goods classification for review', reviewFlags: ['goods/services discrepancy'], allocations: [{ invoiceId: 'si011', whtCentavos: 535714 }, { invoiceId: 'si012', whtCentavos: 321429 }, { invoiceId: 'si013', whtCentavos: 53571 }] };
    assert.equal((await request(`/documents/${added.data.documentId}/certificate`, 'PUT', cert)).status, 200);
    assert.equal((await request(`/documents/${added.data.documentId}/certificate`, 'PUT', cert)).status, 409);
    assert.equal((await request(`/documents/${added.data.documentId}/certificate`, 'PUT', { ...cert, revision: 2, printedWhtCentavos: 1 })).status, 400);
    assert.equal((await request(`/documents/${added.data.documentId}/certificate`, 'PUT', { ...cert, revision: 2, reviewState: 'matched', reviewFlags: [], allocations: [{ invoiceId: 'si011', whtCentavos: 535715 }, { invoiceId: 'si012', whtCentavos: 321428 }, { invoiceId: 'si013', whtCentavos: 53571 }] })).status, 400);
    assert.equal(Object.values(db.store.invoices).reduce((s, i) => s + (i.wht_amount || 0), 0), 16843.7);
  });
}
test('immutable identity includes drive; same URL references deduplicate; bad dates fail', () => {
  const a = documentInput(payload().document); const b = documentInput({ ...payload().document, webUrl: 'https://example.com/renamed' }); assert.equal(a.id, b.id);
  assert.notEqual(a.id, documentInput({ ...payload().document, driveId: 'other-drive' }).id);
  assert.throws(() => require('./financeEvidence').certificateInput({ periodStart: '2026-02-30' }));
});
test('migration dry run, apply/rerun and compensating rollback preserve all source records', async () => {
  const seed = invoices(); const snapshot = { capturedAt: '2026-10-14T00:00:00.000Z', invoices: Object.entries(seed).map(([id, v]) => ({ ...v, id })), reimbursements: [{ id: 'old', status: 'paid' }] };
  const manifest = plan(snapshot); const db = new FinanceFirestore({ invoices: seed });
  assert.equal(manifest.writes.length, 2); const before = fingerprint(db.store.invoices);
  await apply(db, manifest); await apply(db, manifest); assert.equal(Object.keys(db.store.finance_documents).length, 1);
  await apply(db, manifest, true); await apply(db, manifest, true); assert.equal(Object.keys(db.store.finance_documents).length, 0); assert.equal(fingerprint(db.store.invoices), before);
  db.store.invoices.si008.amount_collected = 1; await assert.rejects(apply(db, manifest), /Source precondition/);
});
test('overlapping migration rollbacks retain shared documents until the last reference is removed', async () => {
  const seed = invoices(); seed.si011.scan_file = structuredClone(seed.si008.scan_file);
  const db = new FinanceFirestore({ invoices: seed });
  const a = plan({ invoices: [{ ...seed.si008, id: 'si008' }] });
  const b = plan({ invoices: [{ ...seed.si011, id: 'si011' }] });
  const before = fingerprint(db.store.invoices);
  await apply(db, a); await apply(db, b);
  assert.equal(Object.keys(db.store.finance_documents).length, 1);
  const retained = await apply(db, a, true); assert.equal(retained.retainedSharedDocuments.length, 1);
  assert.equal(Object.keys(db.store.finance_document_links).length, 1);
  assert.equal(Object.keys(db.store.finance_documents).length, 1);
  await apply(db, b, true);
  assert.equal(Object.keys(db.store.finance_document_links).length, 0);
  assert.equal(Object.keys(db.store.finance_documents).length, 0);
  assert.equal(fingerprint(db.store.invoices), before);
});
test('migration rollback preserves documents referenced by inactive runtime history markers', async () => {
  const seed = invoices(); const db = new FinanceFirestore({ invoices: seed });
  const manifest = plan({ invoices: [{ ...seed.si008, id: 'si008' }] }); await apply(db, manifest);
  const documentId = Object.keys(db.store.finance_documents)[0];
  db.store.finance_document_links['retained-history-link'] = { documentId, invoiceId: 'si010', active: false };
  await apply(db, manifest, true);
  assert.ok(db.store.finance_documents[documentId]);
});
test('four audited certificate bases and expected history remain evidence only', async t => {
  const { request, db } = await setup(t, 'server.js');
  const expected = [{ id: 'si004', wht_amount: 300 }, { id: 'si007', wht_amount: 750 }, { id: 'historical-si001', wht_amount: 2561.58 }];
  for (const row of expected) db.store.invoices[row.id] = { ...row, wht_2307_status: 'expected' };
  const before = fingerprint(db.store.invoices);
  for (const [invoiceId, income, wht] of [['si008', 17269113, 773656], ['si011', 26785714, 535714], ['si012', 16071429, 321429], ['si013', 2678571, 53571]]) {
    const body = payload([invoiceId], 'bir2307'); body.document.itemId = `certificate-${invoiceId}`;
    const added = await request('/links', 'POST', body);
    const cert = { revision: 1, periodStart: invoiceId === 'si008' ? '2026-09-01' : '2026-10-01', periodEnd: invoiceId === 'si008' ? '2026-09-30' : '2026-10-31', printedIncomeCentavos: income, printedWhtCentavos: wht, printedAtc: 'WC158', printedDescription: 'Local Supplier of Goods', observedCalculation: invoiceId === 'si008' ? 'Base/rate mismatch' : 'Sales / 1.12 × 2%', reviewState: 'discrepancy', reviewFlags: ['goods versus engineering services'], allocations: [{ invoiceId, whtCentavos: wht }] };
    assert.equal((await request(`/documents/${added.data.documentId}/certificate`, 'PUT', cert)).status, 200);
  }
  assert.equal(fingerprint(db.store.invoices), before);
  assert.equal(Math.round(expected.reduce((s, i) => s + db.store.invoices[i.id].wht_amount, 0) * 100), 361158);
  assert.equal(Object.values(db.store.invoices).filter(i => i.wht_2307_status === 'expected').length, 3);
});
test('migration CLI dry-run requires no credentials and refuses production apply', () => {
  const input = path.join(packaged, 'snapshot.json'); const output = path.join(packaged, 'manifest.json');
  fs.writeFileSync(input, JSON.stringify({ invoices: Object.entries(invoices()).map(([id, row]) => ({ ...row, id })) }));
  const args = ['scripts/migrations/001-invoice-evidence.js', '--snapshot', input, '--manifest', output];
  const message = execFileSync(process.execPath, args, { env: { ...process.env, FIRESTORE_EMULATOR_HOST: '' } }).toString();
  assert.match(message, /DRY RUN: 2 evidence writes/);
  assert.throws(() => execFileSync(process.execPath, [...args, '--apply'], { env: { ...process.env, FIRESTORE_EMULATOR_HOST: '' }, stdio: 'pipe' }), /local-emulator-only/);
});
test('Functions runtime evidence modules stay byte-identical', () => {
  for (const name of ['financeEvidence.js', 'financeEvidenceRouter.js']) assert.equal(fs.readFileSync(`server/${name}`, 'utf8'), fs.readFileSync(path.join(packaged, 'functions/server', name), 'utf8'));
});
