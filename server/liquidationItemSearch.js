'use strict';
// Receipt search: "I have this paper receipt — is it already on a liquidation,
// and has that form's paper packet been handed in?" Matches individual
// liquidation lines by amount, text (supplier / invoice no / particulars / ...)
// and date range, and reports each hit's physical item number, digital receipt
// and paper (vault) status.
const { numberedRows } = require('./liquidationItemNumbers');
const { currentSubmission, rjReviewed } = require('./liquidationWorkflow');

const MAX_RESULTS = 100;
const AMOUNT_TOLERANCE = 1; // pesos; an exact centavo match ranks first

const lower = value => String(value ?? '').toLowerCase();
const alnum = value => lower(value).replace(/[^a-z0-9]/g, '');

function parseCriteria(query = {}) {
  const q = String(query.q || '').trim().slice(0, 200);
  const amountRaw = String(query.amount ?? '').replace(/[₱,\s]/g, '');
  const amount = amountRaw === '' ? null : Number(amountRaw);
  const date = value => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null);
  const criteria = { tokens: q ? lower(q).split(/\s+/).filter(Boolean) : [], amount: Number.isFinite(amount) && amount > 0 ? amount : null, from: date(query.from), to: date(query.to) };
  if (!criteria.tokens.length && criteria.amount === null && !criteria.from && !criteria.to) {
    throw Object.assign(new Error('Enter an amount, some text, or a date range'), { status: 400 });
  }
  return criteria;
}

// Paper status of the form a line belongs to (receipt vault = packet handed to RJ).
function paperStatus(liq, review) {
  if (liq.status !== 'submitted') return { state: 'draft' };
  const submission = review?.physicalSubmission;
  if (submission?.active) {
    if (!currentSubmission(liq, review)) return { state: 'changed_since', submittedDate: submission.submittedDate || null };
    return { state: rjReviewed(liq, review) ? 'reviewed' : 'handed_in', submittedDate: submission.submittedDate || null, reviewDate: review.reviewDate || null };
  }
  if (submission?.returnedAt) return { state: 'returned', returnReason: submission.returnReason || null };
  return { state: 'not_handed_in' };
}

function matchRow(row, liq, criteria) {
  let score = 0;
  if (criteria.amount !== null) {
    const diff = Math.abs((Number(row.amount) || 0) - criteria.amount);
    if (diff > AMOUNT_TOLERANCE) return null;
    score += diff < 0.005 ? 10 : 3;
  }
  if (criteria.from && (!row.date || row.date < criteria.from)) return null;
  if (criteria.to && (!row.date || row.date > criteria.to)) return null;
  if (criteria.tokens.length) {
    const fields = [row.particulars, row.supplier, row.invoiceNo, row.category, row.projectName, row.projectNo, row.remarks, row.poNumber, liq.form_no, liq.employee_name];
    const text = lower(fields.join(' '));
    const compact = alnum(fields.join(''));
    for (const token of criteria.tokens) {
      const t = alnum(token);
      if (text.includes(token)) score += 2;
      else if (t.length >= 3 && compact.includes(t)) score += 1; // "643427" finds "INV-000-643427"
      else return null;
    }
  }
  return score;
}

function receiptList(liq) {
  let receipts = [];
  try { receipts = JSON.parse(liq.receipts_json || '[]'); } catch (_) { receipts = []; }
  return Array.isArray(receipts) ? receipts : [];
}

function receiptsFor(liq, rowId) {
  return receiptList(liq)
    .filter(r => r && r.rowId === rowId && (r.webUrl || r.oneDriveId))
    .map(r => ({ filename: r.filename || null, webUrl: r.webUrl || null, oneDriveId: r.oneDriveId || null }));
}

// One paper receipt is often split over several lines (gas + toll on one
// invoice), so the amount on the paper is the sum of those lines. Lines on the
// same form are treated as one receipt when they share an invoice number, the
// same attached file, or the same supplier on the same date.
function receiptGroups(rows, liq) {
  const parent = new Map(rows.map(r => [r.id, r.id]));
  const find = id => { while (parent.get(id) !== id) id = parent.get(id); return id; };
  const join = (a, b) => parent.set(find(a), find(b));
  const byKey = new Map();
  const link = (key, rowId) => { if (!key) return; if (byKey.has(key)) join(rowId, byKey.get(key)); else byKey.set(key, rowId); };
  for (const r of rows) {
    if (alnum(r.invoiceNo).length >= 3) link(`inv:${alnum(r.supplier)}:${alnum(r.invoiceNo)}`, r.id);
    if (r.date && alnum(r.supplier)) link(`sd:${alnum(r.supplier)}:${r.date}`, r.id);
  }
  for (const rc of receiptList(liq)) if (rc && rc.oneDriveId && parent.has(rc.rowId)) link(`file:${rc.oneDriveId}`, rc.rowId);
  const groups = new Map();
  for (const r of rows) { const g = find(r.id); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
  return [...groups.values()].filter(g => g.length > 1);
}

async function searchLiquidationItems(db, user, query) {
  const criteria = parseCriteria(query);
  const isAdmin = ['admin', 'superadmin'].includes(user.role);
  const snap = isAdmin ? await db.collection('liquidations').get() : await db.collection('liquidations').where('user_id', '==', user.id).get();
  const hits = [];
  for (const doc of snap.docs) {
    const liq = doc.data();
    if (liq.status !== 'submitted' && liq.status !== 'draft') continue;
    let rows;
    try { rows = numberedRows(liq); } catch (_) {
      // Legacy rows without permanent ids: search them anyway, just without item numbers.
      try { rows = JSON.parse(liq.rows_json || '[]'); } catch (__) { rows = []; }
    }
    rows = (Array.isArray(rows) ? rows : []).filter(Boolean);
    const seen = new Set();
    for (const row of rows) {
      const score = matchRow(row, liq, criteria);
      if (score === null) continue;
      seen.add(row.id);
      hits.push({ score, liquidationId: doc.id, liq, row });
    }
    if (criteria.amount !== null && rows.every(r => typeof r.id === 'string')) {
      for (const group of receiptGroups(rows, liq)) {
        const total = Math.round(group.reduce((sum, r) => sum + (Number(r.amount) || 0), 0) * 100) / 100;
        const diff = Math.abs(total - criteria.amount);
        if (diff > AMOUNT_TOLERANCE) continue;
        const otherCriteria = { ...criteria, amount: null };
        const textOk = !otherCriteria.tokens.length && !otherCriteria.from && !otherCriteria.to
          ? true : group.some(r => matchRow(r, liq, otherCriteria) !== null);
        if (!textOk) continue;
        for (const row of group) {
          if (seen.has(row.id)) continue;
          hits.push({ score: diff < 0.005 ? 9 : 2, liquidationId: doc.id, liq, row, invoiceTotal: { total, lines: group.length, exact: diff < 0.005 } });
        }
      }
    }
  }
  hits.sort((a, b) => b.score - a.score || String(b.row.date || '').localeCompare(String(a.row.date || '')));
  const top = hits.slice(0, MAX_RESULTS);
  const reviewIds = [...new Set(top.filter(h => h.liq.status === 'submitted').map(h => h.liquidationId))];
  const reviews = new Map(await Promise.all(reviewIds.map(async id => {
    const r = await db.collection('liquidation_receipt_reviews').doc(id).get();
    return [id, r.exists ? r.data() : null];
  })));
  return {
    total: hits.length,
    truncated: hits.length > top.length,
    results: top.map(({ liquidationId, liq, row, invoiceTotal }) => ({
      liquidationId,
      rowId: row.id || null,
      formNo: liq.form_no || null,
      formStatus: liq.status,
      employeeName: liq.employee_name || null,
      itemNo: Number.isSafeInteger(row.physicalItemNo) ? row.physicalItemNo : null,
      date: row.date || null,
      category: row.category || null,
      particulars: row.particulars || null,
      supplier: row.supplier || null,
      invoiceNo: row.invoiceNo || null,
      projectName: row.projectName || null,
      amount: Number(row.amount) || 0,
      exactAmount: criteria.amount !== null && Math.abs((Number(row.amount) || 0) - criteria.amount) < 0.005,
      // Set when the line matched as part of a split receipt whose lines add up to the amount.
      invoiceTotal: invoiceTotal || null,
      receipts: receiptsFor(liq, row.id),
      paper: paperStatus(liq, reviews.get(liquidationId)),
    })),
  };
}

module.exports = { parseCriteria, paperStatus, matchRow, searchLiquidationItems, MAX_RESULTS };
