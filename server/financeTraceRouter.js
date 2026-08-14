'use strict';

const express = require('express');
const { randomUUID } = require('crypto');
const {
  confirmedReferences,
  focusUrl,
  isProtectedExpense,
  nodeKey,
  normalizeRecord,
  parseLiquidationRows,
  rankCandidates,
} = require('./financeTrace');

const COLLECTIONS = [
  'investments',
  'project_expenses',
  'overhead_expenses',
  'liquidations',
  'cash_advances',
  'reimbursements',
];
const EXPENSE_COLLECTIONS = new Set(['project_expenses', 'overhead_expenses']);
const RECORD_TYPES = new Set([
  'investment', 'expense', 'liquidation', 'cash_advance', 'reimbursement',
]);
const SYNC_SOURCE_TYPES = new Set(['po_sync', 'liquidation_sync', 'migrated']);

function errorResponse(res, status, code, message, extra = {}) {
  return res.status(status).json({ success: false, code, error: message, ...extra });
}

function parseOrigin(req) {
  const type = String(req.params.recordType || '');
  const id = String(req.params.recordId || '');
  if (!RECORD_TYPES.has(type) || !id) {
    return { error: 'Unsupported finance record type or missing id' };
  }
  if (type === 'expense') {
    const collection = String(req.query.collection || '');
    if (!EXPENSE_COLLECTIONS.has(collection)) {
      return { error: 'Expense collection must be project_expenses or overhead_expenses' };
    }
    return { origin: { type, collection, id } };
  }
  if (type === 'liquidation') {
    const rowId = String(req.query.rowId || '');
    if (!rowId) return { error: 'Liquidation rowId is required' };
    return { origin: { type, id, rowId } };
  }
  return { origin: { type, id } };
}

function snapshotRecords(collection, snapshot) {
  return snapshot.docs.flatMap((doc) => {
    const data = doc.data();
    if (collection === 'investments') return [{ type: 'investment', id: doc.id, data }];
    if (collection === 'project_expenses' || collection === 'overhead_expenses') {
      return [{ type: 'expense', collection, id: doc.id, data }];
    }
    if (collection === 'cash_advances') return [{ type: 'cash_advance', id: doc.id, data }];
    if (collection === 'reimbursements') return [{ type: 'reimbursement', id: doc.id, data }];
    if (collection === 'liquidations') {
      const rows = parseLiquidationRows(data.rows_json);
      const formRecord = { type: 'liquidation', id: doc.id, data };
      return [
        formRecord,
        ...rows.filter((row) => row && row.id).map((row) => ({
          type: 'liquidation', id: doc.id, rowId: String(row.id), data, row,
        })),
      ];
    }
    return [];
  });
}

async function loadRecords(db) {
  const snapshots = await Promise.all(COLLECTIONS.map((name) => db.collection(name).get()));
  return snapshots.flatMap((snapshot, index) => snapshotRecords(COLLECTIONS[index], snapshot));
}

function canViewOrigin(user, record) {
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  if (isAdmin) return true;
  const data = record.data || {};
  if (record.type === 'liquidation') return data.user_id === user.id;
  if (record.type === 'cash_advance') return data.user_id === user.id;
  if (record.type === 'reimbursement') return data.employeeId === user.id;
  if (record.type === 'expense') {
    if (user.role === 'tax_filer') return true;
    if (record.collection === 'overhead_expenses') return data.createdBy === user.id;
    return data.createdBy === user.id || SYNC_SOURCE_TYPES.has(data.sourceType);
  }
  // Investment Tracker itself is admin-managed, but trace links are intentionally
  // viewable to authenticated finance users. Mutation still remains admin-only.
  return true;
}

function edgeKey(left, right) {
  return [left, right].sort().join('|');
}

function buildGraph(records) {
  const byKey = new Map(records.map((record) => [nodeKey(record), record]));
  const adjacency = new Map();
  const edgeByPair = new Map();

  const connect = (from, to, relation) => {
    if (!from || !to || from === to || !byKey.has(from) || !byKey.has(to)) return;
    const pair = edgeKey(from, to);
    if (!edgeByPair.has(pair)) {
      edgeByPair.set(pair, { from, to, relation, confirmed: true });
    }
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    if (!adjacency.has(to)) adjacency.set(to, new Set());
    adjacency.get(from).add(to);
    adjacency.get(to).add(from);
  };

  for (const record of records) {
    const from = nodeKey(record);
    for (const reference of confirmedReferences(record)) {
      connect(from, nodeKey(reference.origin), reference.relation);
    }
  }

  // A reimbursement points to the whole liquidation while synced expenses point
  // to itemized rows. Bridge the stored form to its own rows so traversal reaches
  // both without inventing or persisting a second relationship graph.
  for (const record of records) {
    if (record.type === 'liquidation' && record.rowId) {
      connect(`liquidation:${record.id}`, nodeKey(record), 'liquidated_by');
    }
  }

  return { byKey, adjacency, edgeByPair };
}

function traceFrom(origin, graph) {
  const start = nodeKey(origin);
  const visited = new Set();
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    if (visited.has(current) || !graph.byKey.has(current)) continue;
    visited.add(current);
    for (const next of graph.adjacency.get(current) || []) {
      if (!visited.has(next)) queue.push(next);
    }
  }
  const nodes = [...visited].map((key) => normalizeRecord(graph.byKey.get(key)));
  const edges = [...graph.edgeByPair.entries()]
    .filter(([pair]) => pair.split('|').every((key) => visited.has(key)))
    .map(([, edge]) => edge);
  return { nodes, edges };
}

function candidatePool(origin, records) {
  if (origin.type === 'investment') return records.filter((record) => record.type === 'expense');
  if (origin.type === 'expense') return records.filter((record) => record.type === 'investment');
  if (origin.type === 'liquidation') return records.filter((record) => record.type === 'expense');
  if (origin.type === 'cash_advance') {
    return records.filter((record) => record.type === 'liquidation' && record.rowId);
  }
  return records.filter((record) => record.type === 'liquidation' && !record.rowId);
}

function traceResponseFor(origin, records, user) {
  const graph = buildGraph(records);
  const originRecord = graph.byKey.get(nodeKey(origin));
  if (!originRecord || !canViewOrigin(user, originRecord)) return null;
  const trace = traceFrom(origin, graph);
  const candidates = rankCandidates(originRecord, candidatePool(originRecord, records))
    .filter((candidate) => !trace.nodes.some((node) => node.key === candidate.node.key));
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  return {
    originKey: nodeKey(origin),
    nodes: trace.nodes,
    edges: trace.edges,
    candidates,
    permissions: { canConfirm: isAdmin, canResolve: isAdmin },
  };
}

function resolutionError(status, code, message, extra = {}) {
  return Object.assign(new Error(message), { status, code, extra });
}

function validateResolutionBody(body) {
  const actions = new Set([
    'confirm_match',
    'keep_both_separate',
    'keep_investment_delete_expense',
    'keep_expense_delete_investment',
  ]);
  if (!body || !actions.has(body.action)) {
    throw resolutionError(400, 'INVALID_ACTION', 'Unsupported resolution action');
  }
  if (!body.investmentId || !body.expenseId || !EXPENSE_COLLECTIONS.has(body.expenseCollection)) {
    throw resolutionError(400, 'INVALID_PAIR', 'A valid investment and expense pair is required');
  }
  const reason = String(body.reason || '').trim();
  if (!reason) throw resolutionError(400, 'REASON_REQUIRED', 'A review reason is required');
  const investmentCategory = body.investmentCategory === undefined
    ? undefined
    : String(body.investmentCategory).trim();
  if (body.investmentCategory !== undefined && !investmentCategory) {
    throw resolutionError(400, 'INVALID_CATEGORY', 'Investment category cannot be blank');
  }
  return {
    ...body,
    investmentId: String(body.investmentId),
    expenseId: String(body.expenseId),
    reason,
    investmentCategory,
  };
}

function recordVersion(data) {
  return data.updated_at ?? data.updatedAt ?? null;
}

function enforceExpectedVersion(expected, data, label) {
  if (expected === undefined) return;
  const current = recordVersion(data);
  if (String(expected ?? '') !== String(current ?? '')) {
    throw resolutionError(409, 'TRACE_STALE', `${label} changed after this trail was loaded`);
  }
}

function investmentExpenseLink(data) {
  return data.sourceExpenseId || data.linkedExpenseId || null;
}

function expenseInvestmentLink(data) {
  return data.fundingSource?.linkedInvestmentId || data.linkedInvestmentId || null;
}

function protectedSourceFocusUrl(expense) {
  if (expense.sourceLiquidationId && expense.sourceLiquidationRowId) {
    return focusUrl({
      type: 'liquidation', id: String(expense.sourceLiquidationId),
      rowId: String(expense.sourceLiquidationRowId),
    });
  }
  if (expense.sourceCaId) {
    return focusUrl({ type: 'cash_advance', id: String(expense.sourceCaId) });
  }
  if (expense.sourcePoId) {
    return `/finance/purchase-orders?focus=${encodeURIComponent(`purchase_order:${expense.sourcePoId}`)}`;
  }
  return null;
}

function deleteFields(FieldValue, names) {
  return Object.fromEntries(names.map((name) => [name, FieldValue.delete()]));
}

async function resolvePair({ db, FieldValue, user, body, requestId }) {
  const input = validateResolutionBody(body);
  const investmentRef = db.collection('investments').doc(input.investmentId);
  const expenseRef = db.collection(input.expenseCollection).doc(input.expenseId);
  const auditRef = db.collection('finance_trace_audit').doc();
  const timestamp = new Date().toISOString();

  const result = await db.runTransaction(async (transaction) => {
    const [investmentSnapshot, expenseSnapshot] = await Promise.all([
      transaction.get(investmentRef),
      transaction.get(expenseRef),
    ]);
    if (!investmentSnapshot.exists || !expenseSnapshot.exists) {
      throw resolutionError(404, 'PAIR_NOT_FOUND', 'Investment or expense no longer exists');
    }
    const investment = investmentSnapshot.data();
    const expense = expenseSnapshot.data();
    enforceExpectedVersion(input.expectedInvestmentUpdatedAt, investment, 'Investment');
    enforceExpectedVersion(input.expectedExpenseUpdatedAt, expense, 'Expense');

    const linkedExpenseId = investmentExpenseLink(investment);
    const linkedInvestmentId = expenseInvestmentLink(expense);
    if (input.action === 'confirm_match') {
      if (linkedExpenseId && String(linkedExpenseId) !== input.expenseId) {
        throw resolutionError(409, 'PAIR_ALREADY_LINKED', 'Investment is linked to another expense');
      }
      if (linkedInvestmentId && String(linkedInvestmentId) !== input.investmentId) {
        throw resolutionError(409, 'PAIR_ALREADY_LINKED', 'Expense is linked to another investment');
      }
    }

    if (isProtectedExpense(expense)) {
      throw resolutionError(
        422,
        'SOURCE_OWNED_EXPENSE',
        'This expense is synchronized from another finance record and must be corrected at its source',
        { sourceFocusUrl: protectedSourceFocusUrl(expense) },
      );
    }

    const before = {
      investment: { id: input.investmentId, ...investment },
      expense: { id: input.expenseId, collection: input.expenseCollection, ...expense },
    };
    let afterInvestment = { ...before.investment };
    let afterExpense = { ...before.expense };
    let retainedOrigin;

    const clearedInvestmentLinks = deleteFields(FieldValue, [
      'sourceExpenseId', 'sourceCollection', 'sourceExpenseProjectId',
      'linkedExpenseId', 'linkedExpenseCollection', 'linkedExpenseProjectId',
    ]);
    const independentInvestmentPatch = {
      ...clearedInvestmentLinks,
      ...(investment.sourceType === 'expense_sync' ? { sourceType: 'manual' } : {}),
      updated_at: timestamp,
    };
    const corporateExpensePatch = {
      fundingSource: { type: 'corporate_bank' },
      ...deleteFields(FieldValue, ['linkedInvestmentId']),
      updatedAt: timestamp,
    };

    if (input.action === 'confirm_match') {
      const investmentPatch = {
        linkedExpenseId: input.expenseId,
        linkedExpenseCollection: input.expenseCollection,
        linkedExpenseProjectId: expense.projectId || null,
        updated_at: timestamp,
      };
      const expensePatch = {
        fundingSource: {
          type: 'investor_outofpocket',
          investor: investment.investor || '',
          linkedInvestmentId: input.investmentId,
        },
        updatedAt: timestamp,
      };
      await transaction.update(investmentRef, investmentPatch);
      await transaction.update(expenseRef, expensePatch);
      afterInvestment = { ...afterInvestment, ...investmentPatch };
      afterExpense = { ...afterExpense, ...expensePatch };
      retainedOrigin = { type: 'investment', id: input.investmentId };
    } else if (input.action === 'keep_both_separate') {
      await transaction.update(investmentRef, independentInvestmentPatch);
      await transaction.update(expenseRef, corporateExpensePatch);
      afterInvestment = { ...afterInvestment, linkedExpenseId: undefined, sourceExpenseId: undefined, updated_at: timestamp };
      afterExpense = { ...afterExpense, fundingSource: { type: 'corporate_bank' }, updatedAt: timestamp };
      retainedOrigin = { type: 'investment', id: input.investmentId };
    } else if (input.action === 'keep_investment_delete_expense') {
      const investmentPatch = {
        ...independentInvestmentPatch,
        ...(input.investmentCategory ? { category: input.investmentCategory } : {}),
      };
      await transaction.update(investmentRef, investmentPatch);
      await transaction.delete(expenseRef);
      afterInvestment = {
        ...afterInvestment, linkedExpenseId: undefined, sourceExpenseId: undefined,
        ...(input.investmentCategory ? { category: input.investmentCategory } : {}),
        updated_at: timestamp,
      };
      afterExpense = { id: input.expenseId, collection: input.expenseCollection, deleted: true };
      retainedOrigin = { type: 'investment', id: input.investmentId };
    } else {
      await transaction.delete(investmentRef);
      await transaction.update(expenseRef, corporateExpensePatch);
      afterInvestment = { id: input.investmentId, deleted: true };
      afterExpense = { ...afterExpense, fundingSource: { type: 'corporate_bank' }, updatedAt: timestamp };
      retainedOrigin = { type: 'expense', collection: input.expenseCollection, id: input.expenseId };
    }

    const audit = {
      action: input.action,
      reason: input.reason,
      actor: {
        id: user.id,
        username: user.username || null,
        role: user.role,
      },
      requestId,
      createdAt: timestamp,
      pair: {
        investmentId: input.investmentId,
        expenseId: input.expenseId,
        expenseCollection: input.expenseCollection,
      },
      before,
      after: { investment: afterInvestment, expense: afterExpense },
    };
    await transaction.create(auditRef, audit);
    return { retainedOrigin, action: input.action };
  });

  return result;
}

function createFinanceTraceRouter({ db, getCurrentUser, FieldValue }) {
  if (!db || !getCurrentUser || !FieldValue) {
    throw new Error('createFinanceTraceRouter requires db, getCurrentUser, and FieldValue');
  }
  const router = express.Router();

  router.get('/:recordType/:recordId', async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    const parsed = parseOrigin(req);
    if (parsed.error) return errorResponse(res, 400, 'INVALID_ORIGIN', parsed.error);

    try {
      const records = await loadRecords(db);
      const response = traceResponseFor(parsed.origin, records, user);
      if (!response) {
        return errorResponse(res, 404, 'TRACE_NOT_FOUND', 'Finance record not found');
      }
      return res.json(response);
    } catch (error) {
      console.error('[finance-trace] read failed:', error);
      return errorResponse(res, 500, 'TRACE_READ_FAILED', 'Failed to load money trail');
    }
  });

  router.post('/resolve', async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    const isAdmin = user.role === 'superadmin' || user.role === 'admin';
    if (!isAdmin) return errorResponse(res, 403, 'ADMIN_REQUIRED', 'Admin only');

    try {
      const result = await resolvePair({
        db,
        FieldValue,
        user,
        body: req.body,
        requestId: String(req.headers['x-request-id'] || randomUUID()),
      });
      const records = await loadRecords(db);
      const trace = traceResponseFor(result.retainedOrigin, records, user);
      const messages = {
        confirm_match: 'Investment and expense linked.',
        keep_both_separate: 'Records retained and unlinked.',
        keep_investment_delete_expense: 'Investment retained and expense deleted.',
        keep_expense_delete_investment: 'Expense retained and investment deleted.',
      };
      return res.json({ success: true, message: messages[result.action], trace });
    } catch (error) {
      if (error && error.status) {
        return errorResponse(res, error.status, error.code, error.message, error.extra);
      }
      console.error('[finance-trace] resolve failed:', error);
      return errorResponse(res, 500, 'TRACE_RESOLVE_FAILED', 'Failed to resolve money trail');
    }
  });

  return router;
}

module.exports = {
  buildGraph,
  canViewOrigin,
  createFinanceTraceRouter,
  loadRecords,
  parseOrigin,
  resolvePair,
  traceResponseFor,
  traceFrom,
};
