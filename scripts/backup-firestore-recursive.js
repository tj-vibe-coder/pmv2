/**
 * Read-only Firestore backup that preserves documents and every nested
 * subcollection in a single JSON snapshot. It never writes to Firestore.
 *
 * Usage: node scripts/backup-firestore-recursive.js
 * Output: backups/<timestamp>/firestore-recursive.json + manifest.json
 */
const admin = require('firebase-admin');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const keyPath = path.join(projectRoot, 'pmv2-851ae-firebase-adminsdk-fbsvc-c4d13e6cb1.json');
const credential = process.env.FIREBASE_SERVICE_ACCOUNT
  ? admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  : admin.credential.cert(require(keyPath));
admin.initializeApp({ credential });
const db = admin.firestore();

function serialize(value) {
  if (value instanceof admin.firestore.Timestamp) return { __type: 'timestamp', value: value.toDate().toISOString() };
  if (value instanceof admin.firestore.DocumentReference) return { __type: 'reference', path: value.path };
  if (Buffer.isBuffer(value)) return { __type: 'bytes', base64: value.toString('base64') };
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
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
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function exportCollection(collection) {
  const snapshot = await collection.get();
  return mapWithConcurrency(snapshot.docs, 20, async doc => {
    const subcollections = {};
    const children = await doc.ref.listCollections();
    for (const subcollection of children) {
      subcollections[subcollection.id] = await exportCollection(subcollection);
    }
    return { id: doc.id, data: serialize(doc.data()), subcollections };
  });
}

function countDocuments(collections) {
  return Object.values(collections).reduce((total, documents) => total + documents.reduce(
    (documentTotal, document) => documentTotal + 1 + countDocuments(document.subcollections), 0
  ), 0);
}

async function main() {
  const timestamp = new Date().toISOString();
  const stamp = timestamp.replace(/[:.]/g, '-').slice(0, 19);
  const outputDirectory = path.join(projectRoot, 'backups', stamp);
  fs.mkdirSync(outputDirectory, { recursive: true });

  const collections = {};
  const rootCollections = (await db.listCollections()).sort((left, right) => left.id.localeCompare(right.id));
  const exportedCollections = await mapWithConcurrency(rootCollections, 10, async collection => ({
    id: collection.id,
    documents: await exportCollection(collection),
  }));
  for (const collection of exportedCollections) collections[collection.id] = collection.documents;

  const snapshot = { format: 'ioct-firestore-recursive-v1', projectId: 'pmv2-851ae', exportedAt: timestamp, collections };
  const snapshotJson = JSON.stringify(snapshot, null, 2);
  const snapshotPath = path.join(outputDirectory, 'firestore-recursive.json');
  fs.writeFileSync(snapshotPath, snapshotJson, { mode: 0o600 });
  const manifest = {
    format: snapshot.format,
    projectId: snapshot.projectId,
    exportedAt: timestamp,
    topLevelCollections: Object.keys(collections).length,
    totalDocumentsIncludingSubcollections: countDocuments(collections),
    snapshotFile: path.basename(snapshotPath),
    sha256: crypto.createHash('sha256').update(snapshotJson).digest('hex'),
  };
  fs.writeFileSync(path.join(outputDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ outputDirectory, ...manifest }, null, 2));
}

main().catch(error => { console.error('Backup failed:', error); process.exit(1); });
