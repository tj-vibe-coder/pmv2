/**
 * Phase 4: Reconcile every legacy quotation in Firestore against its source workbook.
 *
 * Usage:
 *   node scripts/reconcile-legacy-import.js
 *
 * For each quotation with formulaVersion='legacy', this script:
 *   1) Reads the stored `legacyTotalsSnapshot` from Firestore
 *   2) Re-parses the source xlsx via parse-legacy-calcsheet.js
 *   3) Picks the matching quotation kind from the re-parsed output
 *   4) Compares: subtotal, vat, grandTotal, plus line-item counts
 *   5) Reports any drift over a small tolerance (default ₱0.01)
 *
 * Stubs (no sourceFile, or sourceFile unreadable) are reported but not failed.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
} else {
  const keyFile = path.join(__dirname, '..', 'pmv2-851ae-firebase-adminsdk-fbsvc-c4d13e6cb1.json');
  credential = admin.credential.cert(require(keyFile));
}
admin.initializeApp({ credential });
const db = admin.firestore();

const PARSER = path.join(__dirname, 'parse-legacy-calcsheet.js');
const ROOT = '/Users/reuelrivera/Documents/Projects/IOCT Calcsheet/IO Proposal';
const TOLERANCE = 0.01;  // pesos

// Resolve sourceFile (which may be relative or basename) to an absolute path
function resolveSource(sourceFile) {
  if (!sourceFile) return null;
  if (path.isAbsolute(sourceFile) && fs.existsSync(sourceFile)) return sourceFile;
  // try searching under ROOT
  const basename = path.basename(sourceFile);
  try {
    const out = spawnSync('find', [ROOT, '-name', basename, '-not', '-name', '~$*'], { encoding: 'utf8' });
    const lines = out.stdout.trim().split('\n').filter(Boolean);
    return lines[0] || null;
  } catch {
    return null;
  }
}

function within(a, b, tol = TOLERANCE) { return Math.abs((a || 0) - (b || 0)) <= tol; }

(async () => {
  const qSnap = await db.collection('calcsheet_quotations').where('formulaVersion', '==', 'legacy').get();
  console.log(`Reconciling ${qSnap.size} legacy quotation(s)...\n`);

  const issues = [];
  const missingSource = [];
  const matched = [];
  const parseCache = new Map(); // sourceFile → parsed JSON

  for (const doc of qSnap.docs) {
    const q = doc.data();
    const stored = q.legacyTotalsSnapshot || {};
    const src = q.importedFrom?.sourceFile;
    const project = await db.collection('calcsheet_projects').doc(q.projectId).get();
    const projectCode = project.exists ? project.data().code : '—';
    const label = `${projectCode} (${q.kind} rev ${q.revision})`;

    const resolved = src ? resolveSource(src) : null;
    if (!resolved) {
      missingSource.push({ label, sourceFile: src });
      continue;
    }

    // Reparse (with caching since each xlsx contains both IOCT and ACTI)
    let parsed = parseCache.get(resolved);
    if (!parsed) {
      const proc = spawnSync('node', [PARSER, resolved], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      if (proc.status !== 0) {
        issues.push({ label, reason: 'parse-error', message: proc.stderr.split('\n')[0] });
        continue;
      }
      try { parsed = JSON.parse(proc.stdout); } catch (e) {
        issues.push({ label, reason: 'json-error', message: e.message });
        continue;
      }
      parseCache.set(resolved, parsed);
    }

    // Find the matching kind in the parsed output
    const reQ = parsed.quotations.find((x) => x.kind === q.kind);
    if (!reQ) {
      issues.push({ label, reason: 'kind-not-found', message: `Source parses to ${parsed.quotations.map(x => x.kind).join(',')} but stored kind is ${q.kind}` });
      continue;
    }
    const fresh = reQ.legacyTotalsSnapshot || {};

    const drift = {
      grandTotal: stored.grandTotal - fresh.grandTotal,
      subtotal: stored.subtotal - fresh.subtotal,
      vat: stored.vat - fresh.vat,
    };
    const lineCount = {
      stored: (q.generalReqts?.length || 0) + (q.components?.length || 0) + (q.services?.length || 0),
      fresh: (reQ.generalReqts?.length || 0) + (reQ.components?.length || 0) + (reQ.services?.length || 0),
    };

    const hasDrift = !within(stored.grandTotal, fresh.grandTotal)
      || !within(stored.subtotal, fresh.subtotal)
      || !within(stored.vat, fresh.vat);

    if (hasDrift) {
      issues.push({
        label, reason: 'drift',
        message: `grand stored=${(stored.grandTotal || 0).toFixed(2)} fresh=${(fresh.grandTotal || 0).toFixed(2)} Δ${drift.grandTotal.toFixed(2)} · sub Δ${drift.subtotal.toFixed(2)} · vat Δ${drift.vat.toFixed(2)}`,
        lineCount,
      });
    } else if (lineCount.stored !== lineCount.fresh) {
      issues.push({ label, reason: 'line-count', message: `stored=${lineCount.stored}ln fresh=${lineCount.fresh}ln (totals OK)` });
    } else {
      matched.push(label);
    }
  }

  console.log(`✓ MATCHED (totals within ₱${TOLERANCE}): ${matched.length}`);
  console.log(`⚠ SOURCE MISSING / UNRESOLVABLE: ${missingSource.length}`);
  for (const m of missingSource) console.log(`    ${m.label}  ← ${m.sourceFile || '(no sourceFile)'}`);
  console.log(`✗ ISSUES: ${issues.length}`);
  for (const i of issues) console.log(`    ${i.label}  [${i.reason}]  ${i.message}`);

  console.log(`\nTotal reconciled: ${matched.length + issues.length + missingSource.length} / ${qSnap.size}`);
  process.exit(0);
})().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
