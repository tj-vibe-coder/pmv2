/**
 * Firestore restore — writes a backup snapshot back to Firestore.
 *
 * Usage:
 *   node scripts/restore-firestore.js <backup-dir>
 *   node scripts/restore-firestore.js backups/2026-05-13T13-34-12
 *
 * Options:
 *   --collections=col1,col2   Only restore specific collections (default: all)
 *   --dry-run                 Print what would be restored without writing
 *
 * WARNING: This OVERWRITES existing documents with the same IDs.
 * It does NOT delete documents that exist in Firestore but not in the backup.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ── args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const backupDir = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const onlyFlag = args.find((a) => a.startsWith('--collections='));
const onlyCollections = onlyFlag ? onlyFlag.split('=')[1].split(',') : null;

if (!backupDir) {
  console.error('Usage: node scripts/restore-firestore.js <backup-dir> [--dry-run] [--collections=col1,col2]');
  process.exit(1);
}

const resolvedDir = path.isAbsolute(backupDir)
  ? backupDir
  : path.join(__dirname, '..', backupDir);

if (!fs.existsSync(resolvedDir)) {
  console.error(`Backup directory not found: ${resolvedDir}`);
  process.exit(1);
}

const manifestPath = path.join(resolvedDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error(`No manifest.json found in ${resolvedDir}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// ── credentials ──────────────────────────────────────────────────────────────
let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
} else {
  const keyFile = path.join(__dirname, '..', 'pmv2-851ae-firebase-adminsdk-fbsvc-c4d13e6cb1.json');
  credential = admin.credential.cert(require(keyFile));
}

admin.initializeApp({ credential });
const db = admin.firestore();

// ── helpers ───────────────────────────────────────────────────────────────────
function jsonToFirestoreValue(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    return admin.firestore.Timestamp.fromDate(new Date(value));
  }
  if (typeof value === 'string' && value.startsWith('__ref__:')) {
    return db.doc(value.replace('__ref__:', ''));
  }
  if (Array.isArray(value)) return value.map(jsonToFirestoreValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonToFirestoreValue(v)]));
  }
  return value;
}

async function restoreCollection(colName) {
  const filePath = path.join(resolvedDir, `${colName}.json`);
  if (!fs.existsSync(filePath)) {
    console.log(`  ${colName}: file not found, skipping`);
    return 0;
  }

  const docs = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (docs.length === 0) {
    console.log(`  ${colName}: 0 docs`);
    return 0;
  }

  if (dryRun) {
    console.log(`  ${colName}: would restore ${docs.length} docs [dry-run]`);
    return docs.length;
  }

  // Write in batches of 400 (Firestore limit is 500 per batch)
  const BATCH_SIZE = 400;
  let written = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + BATCH_SIZE);
    for (const doc of chunk) {
      const { id, ...data } = doc;
      const ref = db.collection(colName).doc(id);
      batch.set(ref, jsonToFirestoreValue(data));
    }
    await batch.commit();
    written += chunk.length;
  }

  console.log(`  ${colName}: restored ${written} docs`);
  return written;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nFirestore restore from: ${resolvedDir}`);
  console.log(`Backup timestamp: ${manifest.timestamp}`);
  if (dryRun) console.log('DRY RUN — nothing will be written\n');
  else console.log('');

  const collectionNames = onlyCollections ?? Object.keys(manifest.collections);
  console.log(`Restoring ${collectionNames.length} collection(s): ${collectionNames.join(', ')}\n`);

  let total = 0;
  for (const name of collectionNames) {
    total += await restoreCollection(name);
  }

  console.log(`\nDone. ${total} documents restored.\n`);
}

main().catch((err) => {
  console.error('Restore failed:', err);
  process.exit(1);
});
