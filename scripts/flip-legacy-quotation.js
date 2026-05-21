/**
 * Phase 0 verification helper — flip a calcsheet quotation to legacy mode.
 *
 * Usage:
 *   node scripts/flip-legacy-quotation.js                 # list quotations
 *   node scripts/flip-legacy-quotation.js <id>            # flip the given id to legacy
 *   node scripts/flip-legacy-quotation.js <id> --undo     # revert to current
 *
 * What it does on flip:
 *   - Computes current totals using the CURRENT formula (whatever the app stores produces)
 *   - Writes formulaVersion='legacy', legacyTotalsSnapshot=<computed totals>,
 *     and a fake importedFrom block so the banner shows source info
 *
 * On --undo: clears formulaVersion / legacyTotalsSnapshot / importedFrom.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

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

// Minimal mirror of the CURRENT formulation in src/utils/calcsheet/calc.ts.
function computeTotalsCurrent(q) {
  const cont = (q.globalContingencyPct || 0) / 100;

  const generalReqtsCost = (q.generalReqts || []).reduce(
    (s, l) => s + (l.unitPrice || 0) * (l.qty || 0),
    0,
  );
  const generalReqtsWithContingency = generalReqtsCost * (1 + cont);
  const generalReqtsSubtotal = generalReqtsWithContingency * (1 + (q.generalReqMarkupPct || 0) / 100);

  const componentLine = (l, markup) => {
    const base = (l.unitCost || 0) * (l.forex || 1);
    const adj = base * (1 + (l.contingencyPct || 0) / 100) * (1 - (l.discountPct || 0) / 100);
    return adj * (1 + (markup || 0) / 100) * (l.qty || 0);
  };
  const componentCost = (l) => {
    const base = (l.unitCost || 0) * (l.forex || 1);
    return base * (1 + (l.contingencyPct || 0) / 100) * (1 - (l.discountPct || 0) / 100) * (l.qty || 0);
  };
  const componentsSubtotal = (q.components || []).reduce(
    (s, l) => s + componentLine(l, q.productMarkupPct),
    0,
  );
  const componentsCost = (q.components || []).reduce((s, l) => s + componentCost(l), 0);

  let laborCost; let laborWithContingency; let servicesSub;
  if (q.servicesFromManpower) {
    laborCost = (q.manpower || []).reduce(
      (s, m) => s + (m.headcount || 0) * (m.mandays || 0) * ((m.dailyRate || 0) + (m.allowance || 0)),
      0,
    );
    laborWithContingency = laborCost * (1 + cont);
    servicesSub = laborWithContingency * (1 + (q.laborMarkupPct || 0) / 100);
  } else {
    servicesSub = (q.services || []).reduce((s, l) => s + (l.amount || 0), 0);
    laborCost = servicesSub;
    laborWithContingency = servicesSub;
  }

  const subtotal = generalReqtsSubtotal + componentsSubtotal + servicesSub;
  const discount = subtotal * ((q.discountPct || 0) / 100);
  const afterDiscount = subtotal - discount;
  const vat = afterDiscount * ((q.vatPct || 0) / 100);
  const grandTotal = afterDiscount + vat;

  return {
    generalReqtsCost, generalReqtsWithContingency, generalReqtsSubtotal,
    componentsCost, componentsSubtotal,
    laborCost, laborWithContingency, servicesSubtotal: servicesSub,
    subtotal, discount, vat, grandTotal,
  };
}

async function listQuotations() {
  const snap = await db.collection('calcsheet_quotations').get();
  if (snap.empty) {
    console.log('No quotations found in calcsheet_quotations.');
    return;
  }
  console.log(`Found ${snap.size} quotation(s):\n`);
  for (const doc of snap.docs) {
    const q = doc.data();
    console.log(`  ${doc.id}  kind=${q.kind}  rev=${q.revision}  formula=${q.formulaVersion || 'current'}  project=${q.projectId}`);
  }
  console.log('\nFlip one with:');
  console.log('  node scripts/flip-legacy-quotation.js <id>');
}

async function flipToLegacy(id) {
  const ref = db.collection('calcsheet_quotations').doc(id);
  const doc = await ref.get();
  if (!doc.exists) {
    console.error(`Quotation ${id} not found.`);
    process.exit(1);
  }
  const q = doc.data();
  if (q.formulaVersion === 'legacy') {
    console.log(`Quotation ${id} is already legacy.`);
    return;
  }
  const totals = computeTotalsCurrent(q);
  const patch = {
    formulaVersion: 'legacy',
    legacyTotalsSnapshot: totals,
    importedFrom: {
      sourceFile: 'manual-flip-for-phase0-test.xlsx',
      importedAt: new Date().toISOString(),
      originalCode: q.code || null,
      pdfFilename: 'manual-flip-for-phase0-test.pdf',
    },
    updatedAt: new Date().toISOString(),
  };
  await ref.update(patch);
  console.log(`Flipped ${id} to legacy.`);
  console.log('  grandTotal snapshot:', totals.grandTotal.toFixed(2));
  console.log('\nReload the app and open this quotation. You should see:');
  console.log('  - yellow "Legacy snapshot" banner');
  console.log('  - all inputs disabled');
  console.log('  - "Duplicate to revise" button creating an editable copy');
  console.log('\nRevert with:');
  console.log(`  node scripts/flip-legacy-quotation.js ${id} --undo`);
}

async function undoFlip(id) {
  const ref = db.collection('calcsheet_quotations').doc(id);
  const doc = await ref.get();
  if (!doc.exists) {
    console.error(`Quotation ${id} not found.`);
    process.exit(1);
  }
  await ref.update({
    formulaVersion: admin.firestore.FieldValue.delete(),
    legacyTotalsSnapshot: admin.firestore.FieldValue.delete(),
    importedFrom: admin.firestore.FieldValue.delete(),
    generalReqContingencyMode: admin.firestore.FieldValue.delete(),
    updatedAt: new Date().toISOString(),
  });
  console.log(`Reverted ${id} to current formulation.`);
}

(async () => {
  const [arg1, arg2] = process.argv.slice(2);
  try {
    if (!arg1) {
      await listQuotations();
    } else if (arg2 === '--undo') {
      await undoFlip(arg1);
    } else {
      await flipToLegacy(arg1);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
  process.exit(0);
})();
