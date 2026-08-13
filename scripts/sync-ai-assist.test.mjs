import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { listSourceFiles, checkDrift, syncFiles } from './sync-ai-assist.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-ai-assist-'));
const srcDir = path.join(root, 'src');
const destDir = path.join(root, 'dest');

async function writeTemp(dir, rel, content) {
  const file = path.join(dir, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

test('listSourceFiles returns only non-test .js files', async () => {
  await writeTemp(srcDir, 'a.js', 'console.log("a");\n');
  await writeTemp(srcDir, 'b.js', 'console.log("b");\n');
  await writeTemp(srcDir, 'a.test.js', 'console.log("test");\n');
  const files = await listSourceFiles(srcDir);
  assert.deepEqual(files, ['a.js', 'b.js']);
});

test('syncFiles copies non-test files and checkDrift reports clean', async () => {
  const { copied, removed } = await syncFiles(srcDir, destDir);
  assert.deepEqual(copied, ['a.js', 'b.js']);
  assert.deepEqual(removed, []);
  const result = await checkDrift(srcDir, destDir);
  assert.equal(result.drift, false);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.extra, []);
  assert.deepEqual(result.mismatched, []);
  await assert.rejects(fs.access(path.join(destDir, 'a.test.js')), { code: 'ENOENT' });
});

test('mutating a source file reports drift with mismatched entry', async () => {
  await writeTemp(srcDir, 'a.js', 'console.log("a CHANGED");\n');
  const result = await checkDrift(srcDir, destDir);
  assert.equal(result.drift, true);
  assert.deepEqual(result.mismatched, ['a.js']);
});

test('extra destination file is reported in extra', async () => {
  await writeTemp(destDir, 'stale.js', 'console.log("stale");\n');
  const result = await checkDrift(srcDir, destDir);
  assert.equal(result.drift, true);
  assert.deepEqual(result.extra, ['stale.js']);
  // clean up so this fake stale file does not leak into later tests
  await fs.unlink(path.join(destDir, 'stale.js'));
});

test('deleting a source file removes orphaned destination file', async () => {
  await fs.unlink(path.join(srcDir, 'b.js'));
  const { copied, removed } = await syncFiles(srcDir, destDir);
  assert.deepEqual(copied, ['a.js']);
  assert.deepEqual(removed, ['b.js']);
  await assert.rejects(fs.access(path.join(destDir, 'b.js')), { code: 'ENOENT' });
});

after(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
