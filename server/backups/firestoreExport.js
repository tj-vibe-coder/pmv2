'use strict';

const crypto = require('node:crypto');

function serializeFirestoreValue(value, admin) {
  if (value === null || value === undefined) return value;
  if (admin && admin.firestore && admin.firestore.Timestamp && value instanceof admin.firestore.Timestamp) {
    return { __type: 'timestamp', value: value.toDate().toISOString() };
  }
  if (value && typeof value.toDate === 'function' && typeof value.toMillis === 'function') {
    return { __type: 'timestamp', value: value.toDate().toISOString() };
  }
  if (admin && admin.firestore && admin.firestore.DocumentReference && value instanceof admin.firestore.DocumentReference) {
    return { __type: 'reference', path: value.path };
  }
  if (value && typeof value.path === 'string' && typeof value.id === 'string' && typeof value.collection === 'function') {
    return { __type: 'reference', path: value.path };
  }
  if (admin && admin.firestore && admin.firestore.GeoPoint && value instanceof admin.firestore.GeoPoint) {
    return { __type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (Buffer.isBuffer(value)) {
    return { __type: 'bytes', base64: value.toString('base64') };
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeFirestoreValue(item, admin));
  }
  if (typeof value === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = serializeFirestoreValue(v, admin);
    }
    return result;
  }
  return value;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  }
  const workerCount = Math.min(limit, Math.max(1, items.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

async function exportCollectionRecursively(collectionRef, admin, concurrency = 20) {
  const snapshot = await collectionRef.get();
  return mapWithConcurrency(snapshot.docs, concurrency, async (doc) => {
    const subcollections = {};
    if (typeof doc.ref.listCollections === 'function') {
      const children = await doc.ref.listCollections();
      for (const subcollection of children) {
        subcollections[subcollection.id] = await exportCollectionRecursively(subcollection, admin, concurrency);
      }
    }
    return {
      id: doc.id,
      data: serializeFirestoreValue(doc.data(), admin),
      subcollections,
    };
  });
}

function countDocumentsDeep(collections) {
  if (!collections || typeof collections !== 'object') return 0;
  return Object.values(collections).reduce((total, documents) => {
    if (!Array.isArray(documents)) return total;
    return total + documents.reduce((docTotal, doc) => {
      return docTotal + 1 + countDocumentsDeep(doc.subcollections);
    }, 0);
  }, 0);
}

function getCollectionSummary(collections) {
  const summary = {};
  if (!collections) return summary;
  for (const [colName, docs] of Object.entries(collections)) {
    summary[colName] = Array.isArray(docs) ? docs.length : 0;
  }
  return summary;
}

async function exportFirestoreDatabase(db, admin, options = {}) {
  const timestamp = options.timestamp || new Date().toISOString();
  const collections = {};

  let rootCollections = [];
  if (typeof db.listCollections === 'function') {
    rootCollections = await db.listCollections();
  }

  // Sort root collections alphabetically for deterministic output
  rootCollections.sort((a, b) => a.id.localeCompare(b.id));

  const exported = await mapWithConcurrency(rootCollections, 10, async (col) => ({
    id: col.id,
    documents: await exportCollectionRecursively(col, admin, options.docConcurrency || 20),
  }));

  for (const item of exported) {
    collections[item.id] = item.documents;
  }

  const projectId = (admin && admin.app && admin.app().options && admin.app().options.projectId)
    || process.env.GCLOUD_PROJECT
    || 'pmv2-851ae';

  const snapshot = {
    format: 'ioct-firestore-recursive-v1',
    projectId,
    exportedAt: timestamp,
    collections,
  };

  const snapshotJson = JSON.stringify(snapshot, null, 2);
  const sizeBytes = Buffer.byteLength(snapshotJson, 'utf8');
  const sha256 = crypto.createHash('sha256').update(snapshotJson).digest('hex');
  const totalDocs = countDocumentsDeep(collections);
  const collectionsSummary = getCollectionSummary(collections);

  const manifest = {
    format: snapshot.format,
    projectId,
    exportedAt: timestamp,
    topLevelCollections: Object.keys(collections).length,
    totalDocumentsIncludingSubcollections: totalDocs,
    sizeBytes,
    sha256,
    collectionsSummary,
    snapshotFileName: `firestore-backup-${timestamp.replace(/[:.]/g, '-').slice(0, 19)}.json`,
  };

  return {
    snapshot,
    snapshotJson,
    manifest,
    totalDocs,
    sizeBytes,
    sha256,
  };
}

module.exports = {
  serializeFirestoreValue,
  exportFirestoreDatabase,
  countDocumentsDeep,
  getCollectionSummary,
};
