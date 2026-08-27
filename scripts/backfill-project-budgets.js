/**
 * Backfill Project List `project_budget` from the linked IOCT quotation
 * (VAT-ex value minus margin = cost basis). Same formula as server.js
 * quotationCostBasis / the won-handoff seed.
 *
 * Usage:
 *   node scripts/backfill-project-budgets.js            # dry run
 *   node scripts/backfill-project-budgets.js --apply    # write
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
} else {
  const keyFile = path.join(__dirname, '..', 'pmv2-851ae-firebase-adminsdk-fbsvc-c4d13e6cb1.json');
  if (!fs.existsSync(keyFile)) {
    console.error('No credentials found.');
    process.exit(1);
  }
  credential = admin.credential.cert(require(keyFile));
}
admin.initializeApp({ credential });
const db = admin.firestore();
const APPLY = process.argv.includes('--apply');

function extractServerFn(name) {
  const serverSrc = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');
  const start = serverSrc.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`${name} not found in server.js`);
  const open = serverSrc.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < serverSrc.length; i++) {
    if (serverSrc[i] === '{') depth++;
    else if (serverSrc[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) throw new Error(`Unbalanced braces extracting ${name}`);
  // eslint-disable-next-line no-new-func
  return new Function(`${serverSrc.slice(start, end)}; return ${name};`)();
}

const quotationCostBasis = extractServerFn('quotationCostBasis');
const quotationGrandTotal = extractServerFn('quotationGrandTotal');

function php(n) {
  return '₱' + (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pickLatestIoct(quotations) {
  const iocts = quotations.filter((q) => q.kind === 'IOCT');
  if (!iocts.length) return undefined;
  return [...iocts].sort((a, b) => String(b.revision || '00').localeCompare(String(a.revision || '00')))[0];
}

function matchCalcsheet(ops, csProjects, quotations) {
  if (ops.calcsheet_quotation_id) {
    const q = quotations.find((row) => row.id === ops.calcsheet_quotation_id);
    if (q) {
      const byQuote = csProjects.find((p) => p.id === q.projectId);
      if (byQuote) return byQuote;
    }
  }
  if (ops.calcsheet_project_id) {
    const byId = csProjects.find((p) => p.id === ops.calcsheet_project_id);
    if (byId) return byId;
  }
  const opsId = String(ops.id);
  const byMainId = csProjects.find((p) => String(p.mainProjectId || '') === opsId);
  if (byMainId) return byMainId;
  const candidates = [ops.project_no, ops.calcsheet_code, ops.qtn_no]
    .map((s) => (s || '').trim())
    .filter(Boolean);
  for (const code of candidates) {
    const hit = csProjects.find((p) => p.code === code || p.mainProjectNo === code);
    if (hit) return hit;
  }
  return undefined;
}

(async () => {
  const [projSnap, csSnap, qSnap] = await Promise.all([
    db.collection('projects').get(),
    db.collection('calcsheet_projects').get(),
    db.collection('calcsheet_quotations').get(),
  ]);

  const csProjects = csSnap.docs.map((d) => {
    const { id: _stored, ...data } = d.data();
    return { ...data, id: d.id };
  });
  const quotations = qSnap.docs.map((d) => {
    const { id: _stored, ...data } = d.data();
    return { ...data, id: d.id };
  });
  const quotesByCs = new Map();
  for (const q of quotations) {
    const key = String(q.projectId || '');
    if (!quotesByCs.has(key)) quotesByCs.set(key, []);
    quotesByCs.get(key).push(q);
  }

  const updates = [];
  const skipped = [];

  for (const doc of projSnap.docs) {
    const data = doc.data() || {};
    const ops = {
      id: doc.id,
      project_no: data.project_no,
      qtn_no: data.qtn_no,
      calcsheet_project_id: data.calcsheet_project_id,
      calcsheet_quotation_id: data.calcsheet_quotation_id,
      calcsheet_code: data.calcsheet_code,
      project_name: data.project_name,
      project_budget: data.project_budget,
    };
    let cs = matchCalcsheet(ops, csProjects, quotations);
    if (!cs) {
      // Historical Project List rows were created before calcsheet_project_id
      // was stored. If exactly one IOCT quotation grand total matches the
      // contract amount, treat that as the source.
      const contract = Number(data.updated_contract_amount || data.contract_amount) || 0;
      if (contract > 0) {
        const hits = [];
        for (const q of quotations.filter((row) => row.kind === 'IOCT')) {
          const grand = Number(quotationGrandTotal(q)) || 0;
          if (Math.abs(grand - contract) < 0.05) hits.push(q);
        }
        const uniqueCs = [...new Set(hits.map((q) => q.projectId))];
        if (uniqueCs.length === 1) {
          cs = csProjects.find((p) => p.id === uniqueCs[0]);
        }
      }
    }
    if (!cs) {
      skipped.push({ reason: 'no-calcsheet', ...ops });
      continue;
    }
    const latest = pickLatestIoct(quotesByCs.get(cs.id) || []);
    if (!latest) {
      skipped.push({ reason: 'no-ioct-quote', code: cs.code, ...ops });
      continue;
    }
    const amount = Number(quotationCostBasis(latest)) || 0;
    if (!(amount > 0)) {
      skipped.push({ reason: 'zero-budget', code: cs.code, ...ops });
      continue;
    }
    const current = Number(data.project_budget) || 0;
    if (Math.abs(current - amount) < 0.01) {
      skipped.push({ reason: 'already-set', code: cs.code, amount, ...ops });
      continue;
    }
    updates.push({
      id: doc.id,
      project_no: ops.project_no || '',
      project_name: ops.project_name || '',
      calcsheet: cs.code || cs.id,
      from: current,
      to: amount,
    });
  }

  console.log(APPLY ? 'APPLY' : 'DRY RUN');
  console.log(`Projects: ${projSnap.size}  ·  to update: ${updates.length}  ·  skipped: ${skipped.length}`);
  console.log('');
  for (const u of updates.sort((a, b) => String(a.project_no).localeCompare(String(b.project_no)))) {
    console.log(`${(u.project_no || u.id).padEnd(16)}  ${php(u.from).padStart(16)} → ${php(u.to).padStart(16)}  ${u.calcsheet}  ${u.project_name}`);
  }

  const skipCounts = {};
  for (const s of skipped) skipCounts[s.reason] = (skipCounts[s.reason] || 0) + 1;
  console.log('\nSkipped:', skipCounts);
  if (skipped.filter((s) => s.reason === 'no-calcsheet').length) {
    console.log('No calcsheet link:');
    for (const s of skipped.filter((s) => s.reason === 'no-calcsheet')) {
      console.log(`  ${(s.project_no || s.id).padEnd(16)}  ${s.project_name || ''}`);
    }
  }
  if (skipped.filter((s) => s.reason === 'no-ioct-quote' || s.reason === 'zero-budget').length) {
    console.log('Linked but no IOCT cost:');
    for (const s of skipped.filter((s) => s.reason === 'no-ioct-quote' || s.reason === 'zero-budget')) {
      console.log(`  ${(s.project_no || s.id).padEnd(16)}  ${s.reason}  ${s.code || ''}  ${s.project_name || ''}`);
    }
  }

  if (!APPLY) {
    console.log('\nRe-run with --apply to write project_budget.');
    process.exit(0);
  }

  const now = new Date().toISOString();
  let batch = db.batch();
  let n = 0;
  for (const u of updates) {
    batch.update(db.collection('projects').doc(u.id), { project_budget: u.to, updated_at: now });
    n += 1;
    if (n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (n % 400 !== 0) await batch.commit();
  console.log(`\nWrote project_budget on ${n} project(s).`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
