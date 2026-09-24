// Mirror server/aiAssist/*.js into functions/server/aiAssist/ so Cloud
// Functions can load the AI-assist modules. Test files (*.test.js) are never
// synced. Run with --check to detect drift without writing anything.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

async function walkJsFiles(dir, includeTests) {
  const found = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return found;
    throw err;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await walkJsFiles(full, includeTests)));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.js') &&
      (includeTests || !entry.name.endsWith('.test.js'))
    ) {
      found.push(full);
    }
  }
  return found;
}

export async function listSourceFiles(srcDir) {
  const files = await walkJsFiles(srcDir, false);
  return files.map((file) => path.relative(srcDir, file)).sort();
}

async function listDestinationFiles(destDir) {
  const files = await walkJsFiles(destDir, true);
  return files.map((file) => path.relative(destDir, file)).sort();
}

async function sha256Of(file) {
  return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

export async function checkDrift(srcDir, destDir) {
  const sourceFiles = await listSourceFiles(srcDir);
  const destFiles = await listDestinationFiles(destDir);
  const missing = sourceFiles.filter((rel) => !destFiles.includes(rel));
  const extra = destFiles.filter((rel) => !sourceFiles.includes(rel));
  const mismatched = [];
  for (const rel of sourceFiles) {
    if (destFiles.includes(rel)) {
      const [srcHash, destHash] = await Promise.all([
        sha256Of(path.join(srcDir, rel)),
        sha256Of(path.join(destDir, rel)),
      ]);
      if (srcHash !== destHash) mismatched.push(rel);
    }
  }
  return {
    drift: missing.length > 0 || extra.length > 0 || mismatched.length > 0,
    missing,
    extra,
    mismatched,
  };
}

export async function syncFiles(srcDir, destDir) {
  const sourceFiles = await listSourceFiles(srcDir);
  const copied = [];
  for (const rel of sourceFiles) {
    const destPath = path.join(destDir, rel);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(path.join(srcDir, rel), destPath);
    copied.push(rel);
  }
  const destFiles = await listDestinationFiles(destDir);
  const sourceSet = new Set(sourceFiles);
  const removed = [];
  for (const rel of destFiles) {
    if (!sourceSet.has(rel)) {
      await fs.unlink(path.join(destDir, rel));
      removed.push(rel);
    }
  }
  return { copied, removed };
}

const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const srcDir = path.join(repoRoot, 'server', 'aiAssist');
  const destDir = path.join(repoRoot, 'functions', 'server', 'aiAssist');
  const checkMode = process.argv.includes('--check');
  if (checkMode) {
    const { drift, missing, extra, mismatched } = await checkDrift(srcDir, destDir);
    if (drift) {
      for (const rel of [...missing, ...extra, ...mismatched]) {
        process.stderr.write(`${rel}\n`);
      }
      process.exit(1);
    }
    console.log('No drift detected.');
    process.exit(0);
  }
  const { copied, removed } = await syncFiles(srcDir, destDir);
  for (const rel of copied) console.log(`copied: ${rel}`);
  for (const rel of removed) console.log(`removed: ${rel}`);
}
