/**
 * Phase 2 preview: parse every PCS xlsx in the IO Proposal folder and emit a
 * one-line-per-file summary highlighting warnings.
 *
 * Usage:
 *   node scripts/parse-all-pcs-preview.js [root]
 *   (default root: ../IOCT Calcsheet/IO Proposal)
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = process.argv[2] ||
  '/Users/reuelrivera/Documents/Projects/IOCT Calcsheet/IO Proposal';
const SCRIPT = path.join(__dirname, 'parse-legacy-calcsheet.js');

// Find every Calsheet/*.xlsx under PCS folders. Skip lock files and the literal template folder.
const out = execSync(
  `find "${root}" -path '*/Calsheet/*.xlsx' -not -name '~$*' -not -path '*PCSYYMMXXX*'`,
  { encoding: 'utf8' }
);
const files = out.split('\n').filter((f) => f && /PCS\d/.test(f));

console.log(`Found ${files.length} PCS workbook(s) to preview.\n`);

const results = [];
const issues = [];

for (const file of files) {
  const proc = spawnSync('node', [SCRIPT, file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (proc.status !== 0) {
    issues.push({ file, kind: 'parse-crash', error: proc.stderr.split('\n')[0] });
    console.log(`[CRASH] ${path.basename(file)}: ${proc.stderr.split('\n')[0]}`);
    continue;
  }
  let parsed;
  try {
    parsed = JSON.parse(proc.stdout);
  } catch (e) {
    issues.push({ file, kind: 'json-error', error: e.message });
    console.log(`[JSON ERR] ${path.basename(file)}`);
    continue;
  }
  // Reconstruct effective code the same way the UI does
  const PCS_RE = /^PCS\d{4}\d{3}-[A-Z]{3}-\d{2}$/;
  const reconstructed = parsed.yymm && parsed.seqFromOriginal && parsed.clientCode
    ? `PCS${parsed.yymm}${String(parsed.seqFromOriginal).padStart(3, '0')}-${(parsed.clientCode || 'XXX').toUpperCase().slice(0, 3).padEnd(3, 'X')}-${parsed.revision || '00'}`
    : null;
  let effectiveCode;
  if (PCS_RE.test(parsed.originalCode)) effectiveCode = parsed.originalCode;
  else if (reconstructed && PCS_RE.test(reconstructed)) effectiveCode = reconstructed + ' (recovered)';
  else effectiveCode = '(needs fresh seq)';

  const row = {
    file: path.basename(file),
    projectFolder: path.basename(path.dirname(path.dirname(file))),
    originalCode: parsed.originalCode,
    effectiveCode,
    project: parsed.projectName,
    client: parsed.customer.name,
    clientCode: parsed.customer.code,
    ioctTotal: parsed.quotations.find((q) => q.kind === 'IOCT')?.legacyTotalsSnapshot.grandTotal ?? 0,
    actiTotal: parsed.quotations.find((q) => q.kind === 'ACTI')?.legacyTotalsSnapshot.grandTotal ?? 0,
    ioctLineCount: countLines(parsed.quotations.find((q) => q.kind === 'IOCT')),
    actiLineCount: countLines(parsed.quotations.find((q) => q.kind === 'ACTI')),
    warnings: parsed.warnings,
  };
  results.push(row);
}

function countLines(q) {
  if (!q) return 0;
  return q.generalReqts.length + q.components.length + q.services.length;
}

// Output summary
console.log(`\n=== PARSE SUMMARY (${results.length} files) ===\n`);
console.log('EFFECTIVE CODE'.padEnd(36) + 'CLIENT'.padEnd(6) + 'IOCT (lines, total)'.padEnd(26) + 'ACTI (lines, total)'.padEnd(26) + 'WARNINGS');
console.log('-'.repeat(140));
for (const r of results.sort((a, b) => a.effectiveCode.localeCompare(b.effectiveCode))) {
  const ioct = `${r.ioctLineCount}ln  ₱${r.ioctTotal.toFixed(0).padStart(12)}`;
  const acti = `${r.actiLineCount}ln  ₱${r.actiTotal.toFixed(0).padStart(12)}`;
  const warn = r.warnings.length ? `⚠ ${r.warnings[0].slice(0, 60)}` : '';
  console.log(r.effectiveCode.padEnd(36) + (r.clientCode || '—').padEnd(6) + ioct.padEnd(26) + acti.padEnd(26) + warn);
}

// Detect colliding effective codes
const seenCode = new Map();
const collisions = new Map();
for (const r of results) {
  const codeOnly = r.effectiveCode.replace(/\s*\(.*\)$/, '');
  if (!codeOnly.startsWith('PCS')) continue;
  if (seenCode.has(codeOnly)) {
    if (!collisions.has(codeOnly)) collisions.set(codeOnly, [seenCode.get(codeOnly)]);
    collisions.get(codeOnly).push(r);
  } else {
    seenCode.set(codeOnly, r);
  }
}

console.log(`\n=== ISSUES (${issues.length}) ===`);
for (const i of issues) console.log(`  ${i.kind}: ${path.basename(i.file)} — ${i.error}`);

if (collisions.size > 0) {
  console.log(`\n=== CODE COLLISIONS (${collisions.size}) — these files will conflict on import ===`);
  for (const [code, rows] of collisions.entries()) {
    console.log(`\n  ${code}:`);
    for (const r of rows) {
      console.log(`    - ${r.projectFolder}/${r.file}  (client=${r.clientCode}, IOCT ₱${r.ioctTotal.toFixed(0)})`);
    }
  }
}

// Group files needing manual attention
const needsAttention = results.filter((r) => r.warnings.length > 0 || r.effectiveCode.includes('(') || !r.clientCode);
if (needsAttention.length > 0) {
  console.log(`\n=== NEEDS REVIEW (${needsAttention.length}) ===`);
  for (const r of needsAttention) {
    console.log(`  ${r.projectFolder}/${r.file}`);
    console.log(`    effective code: ${r.effectiveCode}, client: ${r.clientCode || '—'}, project: '${r.project || '(blank)'}'`);
    for (const w of r.warnings) console.log(`    ⚠ ${w}`);
  }
}

const previewPath = path.join(__dirname, 'legacy-import-preview.json');
fs.writeFileSync(previewPath, JSON.stringify({ results, issues }, null, 2));
console.log(`\nFull preview written to: ${previewPath}`);
