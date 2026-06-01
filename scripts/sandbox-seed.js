/**
 * sandbox-seed.js — Load a production Firestore backup into the local emulator.
 *
 * Usage:
 *   node scripts/sandbox-seed.js             # uses latest backup in ./backups/
 *   node scripts/sandbox-seed.js backups/2026-05-28T11-57-46
 *
 * MUST be run after the emulator is already started:
 *   npm run emulator   (in a separate terminal, keep it running)
 *
 * Safety: refuses to run if FIRESTORE_EMULATOR_HOST is not set, so it can
 * never accidentally seed (or overwrite) production data.
 */

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');
const http  = require('http');

// ── safety guard ─────────────────────────────────────────────────────────────
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!EMULATOR_HOST) {
  console.error('\nERROR: FIRESTORE_EMULATOR_HOST is not set.');
  console.error('This script only runs against the local emulator to protect production data.');
  console.error('\nRun via:  npm run sandbox:seed\n');
  process.exit(1);
}

// ── find latest backup ────────────────────────────────────────────────────────
function findLatestBackup() {
  const backupsDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupsDir)) throw new Error('No backups/ directory found. Run: node scripts/backup-firestore.js');
  const dirs = fs.readdirSync(backupsDir)
    .filter(d => fs.statSync(path.join(backupsDir, d)).isDirectory())
    .sort()
    .reverse();
  if (!dirs.length) throw new Error('No backups found. Run: node scripts/backup-firestore.js');
  return path.join(backupsDir, dirs[0]);
}

// ── wait for emulator to be ready ────────────────────────────────────────────
function waitForEmulator(host, maxRetries = 20, intervalMs = 1000) {
  const [hostname, port] = host.split(':');
  return new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = () => {
      const req = http.get({ hostname, port: parseInt(port, 10), path: '/' }, () => {
        resolve();
      });
      req.on('error', () => {
        tries++;
        if (tries >= maxRetries) {
          reject(new Error(`Emulator not ready after ${maxRetries}s. Is "npm run emulator" running?`));
        } else {
          setTimeout(attempt, intervalMs);
        }
      });
      req.setTimeout(800, () => { req.destroy(); });
    };
    attempt();
  });
}

// ── clear a collection in the emulator ───────────────────────────────────────
async function clearCollection(db, collectionName) {
  const snap = await db.collection(collectionName).get();
  if (snap.empty) return 0;
  // Delete in batches of 400
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  return docs.length;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function seed() {
  const backupDir = process.argv[2] || findLatestBackup();
  if (!fs.existsSync(backupDir)) {
    console.error(`Backup directory not found: ${backupDir}`);
    process.exit(1);
  }

  console.log(`\nSandbox seed`);
  console.log(`  Emulator : ${EMULATOR_HOST}`);
  console.log(`  Backup   : ${backupDir}`);
  console.log('');

  // Wait for emulator
  process.stdout.write('Waiting for emulator...');
  await waitForEmulator(EMULATOR_HOST);
  console.log(' ready.\n');

  // Init admin SDK — project ID only, no real credentials needed for emulator
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'pmv2-851ae' });
  }
  const db = admin.firestore();

  // Load collection JSON files from backup (skip manifest.json)
  const files = fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.json') && f !== 'manifest.json')
    .sort();

  let totalDocs = 0;

  for (const file of files) {
    const collection = path.basename(file, '.json');
    const raw = fs.readFileSync(path.join(backupDir, file), 'utf8');
    const docs = JSON.parse(raw);

    if (!Array.isArray(docs) || docs.length === 0) {
      console.log(`  ${collection.padEnd(30)} 0 docs (skipped)`);
      continue;
    }

    // Clear existing emulator data for this collection first
    const cleared = await clearCollection(db, collection);
    if (cleared > 0) process.stdout.write(`  [cleared ${cleared} stale docs] `);

    // Write in batches of 400
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      const chunk = docs.slice(i, i + 400);
      for (const { id, ...data } of chunk) {
        if (!id) continue;
        batch.set(db.collection(collection).doc(String(id)), data);
      }
      await batch.commit();
    }

    console.log(`  ${collection.padEnd(30)} ${docs.length} docs`);
    totalDocs += docs.length;
  }

  console.log(`\nDone! ${totalDocs} documents loaded into emulator.`);
  console.log('Now run:  npm run start:sandbox\n');
  process.exit(0);
}

seed().catch(e => {
  console.error('\nSeed failed:', e.message);
  process.exit(1);
});
