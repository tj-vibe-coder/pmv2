'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { keepStoredReceipts } = require('./liquidationReceiptGuard');

const stored = JSON.stringify([
  { id: 'r1', rowId: 'a', oneDriveId: 'od1' },
  { id: 'r2', rowId: 'b', oneDriveId: 'od2' },
]);

test('an empty save does not wipe stored receipts (LQ26-024-TJC regression)', () => {
  const { receipts, restored } = keepStoredReceipts(stored, [], []);
  assert.deepEqual(receipts.map((r) => r.id), ['r1', 'r2']);
  assert.equal(restored.length, 2);
});

test('receipts the user deleted stay deleted, by receipt id or OneDrive id', () => {
  const { receipts, restored } = keepStoredReceipts(stored, [], ['r1', 'od2']);
  assert.deepEqual(receipts, []);
  assert.deepEqual(restored, []);
});

test('incoming receipts pass through unchanged and are not duplicated', () => {
  const incoming = [{ id: 'r1', rowId: 'a', oneDriveId: 'od1' }, { id: 'r3', rowId: 'c', oneDriveId: 'od3' }];
  const { receipts, restored } = keepStoredReceipts(stored, incoming, []);
  assert.deepEqual(receipts.map((r) => r.id), ['r1', 'r3', 'r2']);
  assert.deepEqual(restored.map((r) => r.id), ['r2']);
});

test('a receipt moved by relabel (same id, new OneDrive id) is not restored twice', () => {
  const { restored } = keepStoredReceipts(stored, [{ id: 'r1', oneDriveId: 'od1' }, { id: 'r2', oneDriveId: 'od2-moved' }], []);
  assert.deepEqual(restored, []);
});

test('malformed or missing stored data is treated as empty', () => {
  assert.deepEqual(keepStoredReceipts('not json', [{ id: 'x' }], []).receipts, [{ id: 'x' }]);
  assert.deepEqual(keepStoredReceipts(undefined, undefined, undefined).receipts, []);
});
