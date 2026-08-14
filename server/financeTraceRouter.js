'use strict';

const express = require('express');
const {
  confirmedReferences,
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
      const graph = buildGraph(records);
      const originRecord = graph.byKey.get(nodeKey(parsed.origin));
      if (!originRecord || !canViewOrigin(user, originRecord)) {
        return errorResponse(res, 404, 'TRACE_NOT_FOUND', 'Finance record not found');
      }
      const trace = traceFrom(parsed.origin, graph);
      const candidates = rankCandidates(originRecord, candidatePool(originRecord, records))
        .filter((candidate) => !trace.nodes.some((node) => node.key === candidate.node.key));
      const isAdmin = user.role === 'superadmin' || user.role === 'admin';
      return res.json({
        originKey: nodeKey(parsed.origin),
        nodes: trace.nodes,
        edges: trace.edges,
        candidates,
        permissions: { canConfirm: isAdmin, canResolve: isAdmin },
      });
    } catch (error) {
      console.error('[finance-trace] read failed:', error);
      return errorResponse(res, 500, 'TRACE_READ_FAILED', 'Failed to load money trail');
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
  traceFrom,
};
