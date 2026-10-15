'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FinanceFirestore } = require('./test-support/financeFirestore');
const { formSeq, previewLiquidationFormNo, allocateLiquidationFormNo, relabelReceipts } = require('./liquidationFormNo');

const kim = { username: 'KIM', initials: 'KKS' };
const renzel = { username: 'renzel', initials: 'RPP' };

test('formSeq reads the shared sequence regardless of initials', () => {
  assert.equal(formSeq('LQ26-018-RPP', '26'), 18);
  assert.equal(formSeq('LQ26-018-KKS', '26'), 18);
  assert.equal(formSeq('LQ25-099-RJR', '26'), null);
  assert.equal(formSeq(null, '26'), null);
});

test('a draft holding a preview number does not take that number on submit (LQ26-018 regression)', async () => {
  const db = new FinanceFirestore({ liquidations: {
    a: { status: 'submitted', form_no: 'LQ26-017-RPP' },
    renzelDraft: { status: 'draft', form_no: 'LQ26-018-RPP' },
  } });
  assert.equal(await previewLiquidationFormNo(db, kim, '26'), 'LQ26-018-KKS');
  const kimNo = await allocateLiquidationFormNo(db, kim, '26');
  db.store.liquidations.k = { status: 'submitted', form_no: kimNo };
  const renzelNo = await allocateLiquidationFormNo(db, renzel, '26');
  assert.equal(kimNo, 'LQ26-018-KKS');
  assert.equal(renzelNo, 'LQ26-019-RPP');
});

test('the counter advances even before the liquidation doc is written, so simultaneous submits differ', async () => {
  const db = new FinanceFirestore({ liquidations: { a: { status: 'submitted', form_no: 'LQ26-020-KKS' } } });
  const nos = await Promise.all([allocateLiquidationFormNo(db, kim, '26'), allocateLiquidationFormNo(db, renzel, '26')]);
  assert.deepEqual(nos.map(n => formSeq(n, '26')).sort(), [21, 22]);
});

test('a hand-edited number above the counter is never reused', async () => {
  const db = new FinanceFirestore({ liquidation_form_counters: { 26: { last: 5 } }, liquidations: { a: { status: 'submitted', form_no: 'LQ26-021-KKS' } } });
  assert.equal(await allocateLiquidationFormNo(db, renzel, '26'), 'LQ26-022-RPP');
});

function fakeGraph(items) {
  const calls = [];
  return { calls, items,
    getItem: async id => structuredClone(items[id]),
    ensureSiblingFolder: async (_parentId, name) => { calls.push(['ensure', name]); return 'newFolder'; },
    updateItem: async (id, patch) => { calls.push(['update', id, patch]); const it = items[id]; const name = patch.name || it.name; return { name, webUrl: `https://od/${name}` }; },
    deleteFolderIfEmpty: async id => { calls.push(['deleteIfEmpty', id]); },
  };
}

test('relabelReceipts moves this form\'s receipts into the assigned number\'s folder and renames numbered files', async () => {
  const graph = fakeGraph({
    f1: { name: 'LQ26-018-RPP_2026-09-01_PHP100.jpg', parentReference: { id: 'old', path: '/drive/root:/Liquidation Receipts/2026/LQ26-018-RPP' } },
    f2: { name: 'receipt-1.jpg', parentReference: { id: 'old', path: '/drive/root:/Liquidation Receipts/2026/LQ26-018-RPP' } },
  });
  const receipts = [
    { rowId: 'r1', oneDriveId: 'f1', filename: 'LQ26-018-RPP_2026-09-01_PHP100.jpg', webUrl: 'x' },
    { rowId: 'r2', oneDriveId: 'f2', filename: 'receipt-1.jpg', webUrl: 'y' },
    { rowId: 'r3', note: 'no file' },
  ];
  const out = await relabelReceipts(receipts, 'LQ26-018-RPP', 'LQ26-019-RPP', graph);
  assert.equal(out.moved, 2);
  assert.equal(out.receipts[0].filename, 'LQ26-019-RPP_2026-09-01_PHP100.jpg');
  assert.equal(out.receipts[0].webUrl, 'https://od/LQ26-019-RPP_2026-09-01_PHP100.jpg');
  assert.equal(out.receipts[1].filename, 'receipt-1.jpg');
  assert.deepEqual(graph.calls.filter(c => c[0] === 'update').map(c => c[2].parentReference.id), ['newFolder', 'newFolder']);
  assert.deepEqual(out.receipts[2], { rowId: 'r3', note: 'no file' });
  assert.ok(graph.calls.some(c => c[0] === 'deleteIfEmpty' && c[1] === 'old'));
});

test('relabelReceipts keeps the old ref when Graph fails, and leaves unrelated folders alone', async () => {
  const graph = fakeGraph({ f1: { name: 'a.jpg', parentReference: { id: 'p', path: '/drive/root:/Somewhere/else' } } });
  graph.getItem = async id => { if (id === 'bad') throw new Error('boom'); return structuredClone(graph.items[id]); };
  const receipts = [{ oneDriveId: 'bad', webUrl: 'keep' }, { oneDriveId: 'f1', webUrl: 'same' }];
  const out = await relabelReceipts(receipts, 'LQ26-018-RPP', 'LQ26-019-RPP', graph);
  assert.equal(out.failed, 1);
  assert.deepEqual(out.receipts, receipts);
  assert.equal(graph.calls.length, 0);
});

test('relabelReceipts handles receipts uploaded before any preview number (draft folder) without renaming files', async () => {
  const graph = fakeGraph({ f1: { name: 'draft-notes.jpg', parentReference: { id: 'd', path: '/drive/root:/Liquidation Receipts/2026/draft' } } });
  const out = await relabelReceipts([{ oneDriveId: 'f1', filename: 'draft-notes.jpg' }], 'draft', 'LQ26-019-RPP', graph);
  assert.equal(out.receipts[0].filename, 'draft-notes.jpg');
  assert.equal(graph.calls.find(c => c[0] === 'update')[2].name, undefined);
});
