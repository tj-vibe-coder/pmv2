'use strict';
// Project Monitoring Dashboard ↔ finance link: per-project spend split by source,
// expenses not tagged to any project, and liquidation lines that never reached
// Finance (the client-side submit sync is best-effort and can silently fail).
//
// Sources:
//   project_expenses   — tagged spend (liquidation_sync / po_sync / manual / …)
//   overhead_expenses  — untagged spend; liquidation_sync rows here are liquidation
//                        lines filed without a project
//   liquidations       — draft lines (not yet in Finance) and the sync check

const LIQUIDATION = 'liquidation';
const PO = 'po';
const LABOR = 'labor';
const MANUAL = 'manual';

function sourceBucket(sourceType) {
  switch (sourceType) {
    case 'liquidation_sync': return LIQUIDATION;
    case 'po_sync': return PO;
    case 'payroll_sync': return LABOR;
    default: return MANUAL; // manual, receipt_scan, expense_sync, migrated, unset
  }
}

function parseRows(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const amountOf = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const emptyProject = () => ({ total: 0, liquidation: 0, po: 0, labor: 0, manual: 0, draftLiquidation: 0, draftLines: 0, count: 0 });

const UNTAGGED_LIMIT = 300;

/**
 * @param {object} db Firestore-like
 * @param {{ id: string, role: string }} user
 * Totals are company-wide for every dashboard user (aggregates only). Line items
 * (untagged list, sync check) are scoped: admins see everyone's, others only their own.
 */
async function buildProjectSpendMonitor(db, user) {
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  const [expSnap, ohSnap, liqSnap] = await Promise.all([
    db.collection('project_expenses').get(),
    db.collection('overhead_expenses').get(),
    db.collection('liquidations').get(),
  ]);

  const byProject = {};
  const syncedRowKeys = new Set();
  const liqWithLegacySync = new Set(); // synced rows that predate sourceLiquidationRowId
  const noteSync = (data) => {
    if (!data.sourceLiquidationId) return;
    const liqId = String(data.sourceLiquidationId);
    if (data.sourceLiquidationRowId) syncedRowKeys.add(`${liqId}:${data.sourceLiquidationRowId}`);
    else liqWithLegacySync.add(liqId);
  };

  expSnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    noteSync(data);
    const pid = String(data.projectId || '').trim();
    const amt = amountOf(data.amount);
    if (!pid || !amt) return;
    const p = (byProject[pid] ||= emptyProject());
    p[sourceBucket(data.sourceType)] += amt;
    p.total += amt;
    p.count += 1;
  });

  const untagged = [];
  const untaggedTotals = { liquidation: 0, manual: 0, draft: 0 };
  ohSnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    noteSync(data);
    // Payroll (office salaries / govt contributions) is genuine overhead, never a missed tag.
    if (data.sourceType === 'payroll_sync' || doc.id.startsWith('payroll_sync_')) return;
    const amt = amountOf(data.amount);
    if (!amt) return;
    const kind = data.sourceType === 'liquidation_sync' ? 'liquidation' : 'manual';
    untaggedTotals[kind] += amt;
    if (!isAdmin && data.createdBy !== user.id) return;
    untagged.push({
      kind,
      collection: 'overhead_expenses',
      id: doc.id,
      description: data.description || '',
      category: data.category || 'Others',
      amount: amt,
      date: data.date || null,
      supplier: data.supplier || null,
      filedBy: data.liquidationFiledBy || null,
      liquidationId: data.sourceLiquidationId ? String(data.sourceLiquidationId) : null,
      liquidationRowId: data.sourceLiquidationRowId || null,
      receiptUrl: data.receiptRef?.webUrl || null,
    });
  });

  const notInFinance = [];
  let notInFinanceTotal = 0;
  liqSnap.docs.forEach((doc) => {
    const liq = doc.data() || {};
    if (liq.status === 'deleted') return;
    const own = liq.user_id === user.id;
    const rows = parseRows(liq.rows_json);
    const base = {
      liquidationId: doc.id,
      formNo: liq.form_no || '',
      employee: liq.employee_name || '',
      formStatus: liq.status || 'draft',
    };
    if (liq.status !== 'submitted') {
      // Drafts: not in Finance yet by design. Count tagged lines as pending
      // project spend; list untagged ones so they get a project before submit.
      rows.forEach((r) => {
        const amt = amountOf(r.amount);
        if (!(amt > 0)) return;
        const pid = String(r.projectId || '').trim();
        if (pid) {
          const p = (byProject[pid] ||= emptyProject());
          p.draftLiquidation += amt;
          p.draftLines += 1;
          return;
        }
        untaggedTotals.draft += amt;
        if (!isAdmin && !own) return;
        untagged.push({
          ...base,
          kind: 'draft',
          collection: null,
          id: `${doc.id}:${r.id}`,
          description: (r.particulars || '').trim() || 'Liquidation line',
          category: (r.category || '').trim() || 'Others',
          amount: amt,
          date: r.date || null,
          supplier: (r.supplier || '').trim() || null,
          filedBy: liq.employee_name || null,
          liquidationRowId: r.id || null,
          receiptUrl: null,
        });
      });
      return;
    }
    if (!isAdmin) return; // sync check needs every user's expense rows to be meaningful
    if (liqWithLegacySync.has(doc.id)) return; // can't match rows reliably — assume synced
    rows.forEach((r) => {
      const amt = amountOf(r.amount);
      if (!(amt > 0) || !r.id) return;
      if (syncedRowKeys.has(`${doc.id}:${r.id}`)) return;
      notInFinanceTotal += amt;
      notInFinance.push({
        ...base,
        id: `${doc.id}:${r.id}`,
        liquidationRowId: r.id,
        description: (r.particulars || '').trim() || 'Liquidation line',
        category: (r.category || '').trim() || 'Others',
        amount: amt,
        date: r.date || null,
        projectId: String(r.projectId || '').trim() || null,
        projectName: (r.projectName || '').trim() || null,
      });
    });
  });

  const byDateDesc = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));
  untagged.sort(byDateDesc);
  notInFinance.sort(byDateDesc);

  return {
    scope: isAdmin ? 'all' : 'own',
    byProject,
    untagged: {
      totals: { ...untaggedTotals, all: untaggedTotals.liquidation + untaggedTotals.manual + untaggedTotals.draft },
      count: untagged.length,
      items: untagged.slice(0, UNTAGGED_LIMIT),
    },
    notInFinance: isAdmin
      ? { total: notInFinanceTotal, count: notInFinance.length, items: notInFinance.slice(0, UNTAGGED_LIMIT) }
      : null,
  };
}

module.exports = { buildProjectSpendMonitor, sourceBucket };
