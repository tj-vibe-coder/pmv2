'use strict';
// Cash advance numbers: CA<YY>-<###>-<INITIALS>, e.g. CA26-001-RJR (same shape as LQ26-028-RPP).
//
// One running sequence per year shared by everyone; initials are the CA OWNER's (the person the
// advance is for, not whoever typed it in on their behalf). Allocation runs in a transaction over
// the counter + existing numbers, so two simultaneous requests can never share a number (the old
// CA<YYMM>-### scan-max generator had no lock). A number whose CA write later fails leaves a gap.
// Uniqueness is judged on CA<YY>-<###> alone, so initials can't create a "duplicate".

const { formSubmitterInitials } = require('./liquidationFormNo');

const COUNTER_COLLECTION = 'ca_counters';

function caSeq(caNo, yy) {
  if (typeof caNo !== 'string') return null;
  const m = caNo.trim().toUpperCase().match(new RegExp(`^CA${yy}-(\\d{3,})-`));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function formatCaNo(yy, seq, user) {
  return `CA${yy}-${String(seq).padStart(3, '0')}-${formSubmitterInitials(user)}`;
}

function maxSeq(docs, yy) {
  let max = 0;
  for (const d of docs) {
    const n = caSeq(d.data().ca_no, yy);
    if (n != null && n > max) max = n;
  }
  return max;
}

async function allocateCaNo(db, user, yy) {
  const counterRef = db.collection(COUNTER_COLLECTION).doc(yy);
  return db.runTransaction(async (tx) => {
    const counter = await tx.get(counterRef);
    const snap = await tx.get(db.collection('cash_advances'));
    const last = Math.max(maxSeq(snap.docs, yy), counter.exists ? Number(counter.data().last) || 0 : 0);
    const next = last + 1;
    tx.set(counterRef, { last: next, updated_at: Math.floor(Date.now() / 1000) }, { merge: true });
    return formatCaNo(yy, next, user);
  });
}

module.exports = { COUNTER_COLLECTION, caSeq, formatCaNo, allocateCaNo };
