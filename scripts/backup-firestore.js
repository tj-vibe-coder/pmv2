/**
 * Firestore full backup — dumps every collection to JSON.
 *
 * Usage:
 *   node scripts/backup-firestore.js
 *
 * Output: backups/YYYY-MM-DD_HH-MM-SS/
 *   Each collection becomes <collection>.json with an array of { id, ...data } objects.
 *   A manifest.json lists what was backed up and when.
 *
 * Credentials: reads FIREBASE_SERVICE_ACCOUNT env var first, then falls back to
 * the service account JSON file in the project root.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ── credentials ──────────────────────────────────────────────────────────────
let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
} else {
  const keyFile = path.join(__dirname, '..', 'pmv2-851ae-firebase-adminsdk-fbsvc-c4d13e6cb1.json');
  if (!fs.existsSync(keyFile)) {
    console.error('No credentials found. Set FIREBASE_SERVICE_ACCOUNT or place the service account JSON in the project root.');
    process.exit(1);
  }
  credential = admin.credential.cert(require(keyFile));
}

admin.initializeApp({ credential });
const db = admin.firestore();

// ── output directory ──────────────────────────────────────────────────────────
const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.join(__dirname, '..', 'backups', stamp);
fs.mkdirSync(outDir, { recursive: true });

// ── helpers ───────────────────────────────────────────────────────────────────
function firestoreValueToJson(value) {
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  if (value instanceof admin.firestore.DocumentReference) return `__ref__:${value.path}`;
  if (Array.isArray(value)) return value.map(firestoreValueToJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, firestoreValueToJson(v)]));
  }
  return value;
}

async function backupCollection(colName) {
  const snap = await db.collection(colName).get();
  if (snap.empty) {
    console.log(`  ${colName}: 0 docs (skipped)`);
    return 0;
  }
  const docs = snap.docs.map((d) => ({ id: d.id, ...firestoreValueToJson(d.data()) }));
  fs.writeFileSync(path.join(outDir, `${colName}.json`), JSON.stringify(docs, null, 2));
  console.log(`  ${colName}: ${docs.length} docs`);
  return docs.length;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nFirestore backup → ${outDir}\n`);

  // Discover all top-level collections automatically
  const collections = await db.listCollections();
  const names = collections.map((c) => c.id).sort();

  console.log(`Found ${names.length} collections: ${names.join(', ')}\n`);

  const manifest = { timestamp: now.toISOString(), collections: {} };

  for (const name of names) {
    const count = await backupCollection(name);
    manifest.collections[name] = count;
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const total = Object.values(manifest.collections).reduce((a, b) => a + b, 0);
  console.log(`\nDone. ${total} documents across ${names.length} collections.`);
  console.log(`Backup saved to: ${outDir}\n`);
}

main().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
