'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  serializeFirestoreValue,
  countDocumentsDeep,
  getCollectionSummary,
  exportFirestoreDatabase,
} = require('./firestoreExport');
const { createBackupsRouter } = require('./router');

test('serializeFirestoreValue handles primitive types and nested objects', () => {
  assert.equal(serializeFirestoreValue('hello'), 'hello');
  assert.equal(serializeFirestoreValue(123), 123);
  assert.equal(serializeFirestoreValue(null), null);
  assert.equal(serializeFirestoreValue(undefined), undefined);
  assert.deepEqual(serializeFirestoreValue([1, 2, 'three']), [1, 2, 'three']);
  assert.deepEqual(serializeFirestoreValue({ a: 1, b: 'two' }), { a: 1, b: 'two' });
});

test('serializeFirestoreValue handles custom timestamp and reference duck-types', () => {
  const fakeTimestamp = {
    toDate: () => new Date('2026-08-18T10:00:00.000Z'),
    toMillis: () => 1787047200000,
  };
  const serializedTs = serializeFirestoreValue(fakeTimestamp);
  assert.deepEqual(serializedTs, {
    __type: 'timestamp',
    value: '2026-08-18T10:00:00.000Z',
  });

  const fakeRef = {
    id: 'doc123',
    path: 'projects/doc123',
    collection: () => {},
  };
  const serializedRef = serializeFirestoreValue(fakeRef);
  assert.deepEqual(serializedRef, {
    __type: 'reference',
    path: 'projects/doc123',
  });

  const fakeBuffer = Buffer.from('hello world');
  const serializedBuf = serializeFirestoreValue(fakeBuffer);
  assert.deepEqual(serializedBuf, {
    __type: 'bytes',
    base64: Buffer.from('hello world').toString('base64'),
  });
});

test('countDocumentsDeep and getCollectionSummary calculate correct totals', () => {
  const collections = {
    users: [
      { id: 'u1', data: {}, subcollections: {} },
      { id: 'u2', data: {}, subcollections: { logs: [{ id: 'l1', data: {}, subcollections: {} }] } },
    ],
    projects: [
      { id: 'p1', data: {}, subcollections: {} },
    ],
  };

  assert.equal(countDocumentsDeep(collections), 4);
  assert.deepEqual(getCollectionSummary(collections), {
    users: 2,
    projects: 1,
  });
});

test('exportFirestoreDatabase generates deterministic snapshot and SHA-256 manifest', async () => {
  const fakeDb = {
    listCollections: async () => [
      {
        id: 'projects',
        get: async () => ({
          docs: [
            {
              id: 'p1',
              data: () => ({ name: 'Test Project', amount: 5000 }),
              ref: { listCollections: async () => [] },
            },
          ],
        }),
      },
      {
        id: 'clients',
        get: async () => ({
          docs: [
            {
              id: 'c1',
              data: () => ({ name: 'Acme Corp' }),
              ref: { listCollections: async () => [] },
            },
          ],
        }),
      },
    ],
  };

  const fakeAdmin = {
    app: () => ({ options: { projectId: 'test-pmv2' } }),
  };

  const result = await exportFirestoreDatabase(fakeDb, fakeAdmin, {
    timestamp: '2026-08-18T12:00:00.000Z',
  });

  assert.equal(result.totalDocs, 2);
  assert.equal(result.manifest.topLevelCollections, 2);
  assert.equal(result.manifest.projectId, 'test-pmv2');
  assert.equal(typeof result.sha256, 'string');
  assert.equal(result.sha256.length, 64);
  assert.ok(result.snapshotJson.includes('Test Project'));
  assert.ok(result.snapshotJson.includes('Acme Corp'));
});
