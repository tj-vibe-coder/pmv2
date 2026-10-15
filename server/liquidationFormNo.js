'use strict';
// Liquidation form numbers: LQ<YY>-<###>-<INITIALS>, e.g. LQ26-022-RJR.
//
// The number is assigned by the server at the moment a liquidation is submitted,
// inside a Firestore transaction. Drafts only ever show a *preview*. Before this,
// the browser fetched a number when the form opened and sent it back on submit;
// a draft held LQ26-018 for 11 days while another user's submit also got 018,
// and the duplicate check compared the full string (initials included) so
// LQ26-018-RPP and LQ26-018-KKS both went through.
//
// The sequence (the ### part) is shared by everyone, so uniqueness is judged on
// LQ<YY>-<###> alone. Allocation takes max(counter, highest submitted number) + 1,
// so a counter that is missing, or behind a hand-edited number, still can't clash.

const COUNTER_COLLECTION = 'liquidation_form_counters';

function formSubmitterInitials(user) {
  const raw = (user && (user.initials || user.username)) ? String(user.initials || user.username) : '';
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'NA';
}

function formSeq(formNo, yy) {
  if (typeof formNo !== 'string') return null;
  const m = formNo.match(new RegExp(`^LQ${yy}-(\\d{3,})-`));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function formatFormNo(yy, seq, user) {
  return `LQ${yy}-${String(seq).padStart(3, '0')}-${formSubmitterInitials(user)}`;
}

function maxSeq(docs, yy) {
  let max = 0;
  for (const d of docs) {
    const n = formSeq(d.data().form_no, yy);
    if (n != null && n > max) max = n;
  }
  return max;
}

function submittedQuery(db) {
  return db.collection('liquidations').where('status', '==', 'submitted');
}

// What the next submit would get right now. Display only, never stored.
async function previewLiquidationFormNo(db, user, yy) {
  const [snap, counter] = await Promise.all([
    submittedQuery(db).get(),
    db.collection(COUNTER_COLLECTION).doc(yy).get(),
  ]);
  const last = Math.max(maxSeq(snap.docs, yy), counter.exists ? Number(counter.data().last) || 0 : 0);
  return formatFormNo(yy, last + 1, user);
}

// Reserve the next number. The transaction reads the counter and the submitted
// set, so two simultaneous submits retry instead of sharing a number. A number
// whose liquidation write later fails is skipped (a gap), never reused.
async function allocateLiquidationFormNo(db, user, yy) {
  const counterRef = db.collection(COUNTER_COLLECTION).doc(yy);
  return db.runTransaction(async (tx) => {
    const counter = await tx.get(counterRef);
    const snap = await tx.get(submittedQuery(db));
    const last = Math.max(maxSeq(snap.docs, yy), counter.exists ? Number(counter.data().last) || 0 : 0);
    const next = last + 1;
    tx.set(counterRef, { last: next, updated_at: Math.floor(Date.now() / 1000) }, { merge: true });
    return formatFormNo(yy, next, user);
  });
}

// Receipts uploaded while drafting live in `Liquidation Receipts/<year>/<preview no>/`.
// After the real number is assigned, move this liquidation's own files into the
// folder for that number (other drafts may share the preview folder, so the
// folder itself is not renamed), rename files that carry the old number, and
// return the receipts with refreshed name/webUrl. Best-effort per file: a file
// that can't be moved keeps its old ref, which still opens.
async function relabelReceipts(receipts, oldNo, newNo, graph) {
  if (!Array.isArray(receipts) || !receipts.length || !oldNo || !newNo || oldNo === newNo) {
    return { receipts, moved: 0, failed: 0 };
  }
  const out = [];
  let moved = 0;
  let failed = 0;
  const targetFolders = new Map();
  const emptiedCandidates = new Set();
  for (const r of receipts) {
    if (!r || !r.oneDriveId) { out.push(r); continue; }
    try {
      const item = await graph.getItem(r.oneDriveId);
      const parent = item.parentReference || {};
      const parentName = parent.path ? decodeURIComponent(parent.path.split('/').pop()) : null;
      const update = {};
      if (parentName === oldNo && parent.id) {
        if (!targetFolders.has(parent.id)) targetFolders.set(parent.id, await graph.ensureSiblingFolder(parent.id, newNo));
        update.parentReference = { id: targetFolders.get(parent.id) };
        emptiedCandidates.add(parent.id);
      }
      if (/^LQ\d/.test(oldNo) && item.name.includes(oldNo)) update.name = item.name.split(oldNo).join(newNo);
      if (!Object.keys(update).length) { out.push(r); continue; }
      const res = await graph.updateItem(r.oneDriveId, update);
      const next = { ...r, webUrl: res.webUrl || r.webUrl };
      if (update.name && r.filename) next.filename = res.name || update.name;
      out.push(next);
      moved++;
    } catch (err) {
      failed++;
      out.push(r);
    }
  }
  for (const folderId of emptiedCandidates) {
    try { await graph.deleteFolderIfEmpty(folderId); } catch (_) { /* leave it */ }
  }
  return { receipts: out, moved, failed };
}

module.exports = {
  COUNTER_COLLECTION,
  formSubmitterInitials,
  formSeq,
  formatFormNo,
  previewLiquidationFormNo,
  allocateLiquidationFormNo,
  relabelReceipts,
};
