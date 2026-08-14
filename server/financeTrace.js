'use strict';

const EXPENSE_COLLECTIONS = new Set(['project_expenses', 'overhead_expenses']);
const PROTECTED_SOURCE_TYPES = new Set([
  'po_sync',
  'liquidation_sync',
  'payroll_sync',
  'ca_writeoff',
]);
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'at', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to',
  'expense', 'expenses', 'payment', 'project', 'php', 'peso', 'pesos',
]);

function encode(value) {
  return encodeURIComponent(String(value));
}

function focusToken(origin) {
  if (origin.type === 'expense') {
    return `expense:${origin.collection}:${encode(origin.id)}`;
  }
  if (origin.type === 'liquidation') {
    return `liquidation:${encode(origin.id)}:${encode(origin.rowId || '__form__')}`;
  }
  return `${origin.type}:${encode(origin.id)}`;
}

function focusUrl(origin) {
  const routes = {
    investment: '/finance/investment-tracker',
    expense: '/finance/expense-monitoring',
    liquidation: '/finance/expense-monitoring/liquidation-form',
    cash_advance: '/finance/expense-monitoring/ca-form',
    reimbursement: '/finance/reimbursements',
  };
  return `${routes[origin.type]}?focus=${encodeURIComponent(focusToken(origin))}`;
}

function nodeKey(origin) {
  if (!origin || !origin.type || !origin.id) return '';
  if (origin.type === 'expense') return `expense:${origin.collection}:${origin.id}`;
  if (origin.type === 'liquidation') {
    return origin.rowId && origin.rowId !== '__form__'
      ? `liquidation:${origin.id}:${origin.rowId}`
      : `liquidation:${origin.id}`;
  }
  return `${origin.type}:${origin.id}`;
}

function parseLiquidationRows(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stringValue(...values) {
  const value = values.find((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim());
  return value === undefined ? undefined : String(value).trim();
}

function numberValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

function dateValue(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') {
    const milliseconds = value < 100000000000 ? value * 1000 : value;
    return new Date(milliseconds).toISOString().slice(0, 10);
  }
  if (typeof value.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
  const raw = String(value);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== ''));
}

function normalizeRecord(record) {
  const { type, id, data = {}, row } = record;
  const origin = type === 'expense'
    ? { type, collection: record.collection, id }
    : type === 'liquidation'
      ? { type, id, rowId: record.rowId || row?.id }
      : { type, id };

  if (type === 'investment') {
    const description = stringValue(data.description, data.category, 'Investment');
    const secondary = [data.investor, data.category].filter(Boolean).join(' · ');
    return compact({
      key: nodeKey(origin), type, id, collection: 'investments', label: description,
      secondaryLabel: secondary, date: dateValue(data.date || data.created_at),
      amount: numberValue(data.amount), status: stringValue(data.status),
      projectId: stringValue(data.projectId, data.sourceExpenseProjectId, data.linkedExpenseProjectId),
      projectName: stringValue(data.projectName), sourceType: stringValue(data.sourceType),
      focusUrl: focusUrl(origin),
    });
  }

  if (type === 'expense') {
    return compact({
      key: nodeKey(origin), type, id, collection: record.collection,
      label: stringValue(data.description, data.remarks, data.category, 'Expense'),
      secondaryLabel: stringValue(data.projectName, data.category),
      date: dateValue(data.date || data.createdAt), amount: numberValue(data.amount),
      status: stringValue(data.status), projectId: stringValue(data.projectId),
      projectName: stringValue(data.projectName), sourceType: stringValue(data.sourceType),
      focusUrl: focusUrl(origin),
    });
  }

  if (type === 'liquidation') {
    const selectedRow = row || {};
    return compact({
      key: nodeKey(origin), type, id, rowId: origin.rowId, collection: 'liquidations',
      label: stringValue(selectedRow.particulars, selectedRow.description, data.form_no, 'Liquidation'),
      secondaryLabel: stringValue(data.form_no, data.employee_name),
      date: dateValue(selectedRow.date || data.date_of_submission || data.created_at),
      amount: numberValue(selectedRow.amount, data.total_amount), status: stringValue(data.status),
      projectId: stringValue(selectedRow.projectId, selectedRow.project_id),
      projectName: stringValue(selectedRow.projectName, selectedRow.project_name),
      sourceType: 'liquidation', focusUrl: focusUrl(origin),
    });
  }

  if (type === 'cash_advance') {
    return compact({
      key: nodeKey(origin), type, id, collection: 'cash_advances',
      label: stringValue(data.ca_no, data.purpose, 'Cash Advance'),
      secondaryLabel: stringValue(data.purpose, data.project_name),
      date: dateValue(data.requested_at || data.approved_at || data.created_at),
      amount: numberValue(data.amount), status: stringValue(data.status),
      projectId: stringValue(data.project_id), projectName: stringValue(data.project_name),
      sourceType: 'cash_advance', focusUrl: focusUrl(origin),
    });
  }

  if (type === 'reimbursement') {
    const formNo = stringValue(data.formNo, data.form_no);
    return compact({
      key: nodeKey(origin), type, id, collection: 'reimbursements',
      label: formNo ? `Reimbursement · ${formNo}` : 'Reimbursement',
      secondaryLabel: stringValue(data.employeeName, data.full_name, data.username),
      date: dateValue(data.createdAt || data.paidAt), amount: numberValue(data.amount),
      status: stringValue(data.status), projectId: stringValue(data.projectId),
      projectName: stringValue(data.projectName), sourceType: stringValue(data.origin, 'reimbursement'),
      focusUrl: focusUrl(origin),
    });
  }

  throw new Error(`Unsupported finance trace type: ${type}`);
}

function validExpenseOrigin(id, collection) {
  return id && EXPENSE_COLLECTIONS.has(collection)
    ? { type: 'expense', collection, id: String(id) }
    : null;
}

function confirmedReferences(record) {
  const { type, data = {} } = record;
  const references = [];

  if (type === 'investment') {
    const expense = validExpenseOrigin(
      data.sourceExpenseId || data.linkedExpenseId,
      data.sourceCollection || data.linkedExpenseCollection,
    );
    if (expense) references.push({ origin: expense, relation: 'recorded_as_expense' });
  }

  if (type === 'expense') {
    const investmentId = data.fundingSource?.linkedInvestmentId || data.linkedInvestmentId;
    if (investmentId) {
      references.push({
        origin: { type: 'investment', id: String(investmentId) },
        relation: 'funded_by',
      });
    }
    if (data.sourceLiquidationId && data.sourceLiquidationRowId) {
      references.push({
        origin: {
          type: 'liquidation', id: String(data.sourceLiquidationId),
          rowId: String(data.sourceLiquidationRowId),
        },
        relation: 'liquidated_by',
      });
    }
    if (data.sourceCaId) {
      references.push({
        origin: { type: 'cash_advance', id: String(data.sourceCaId) },
        relation: 'funded_by_cash_advance',
      });
    }
  }

  if (type === 'liquidation' && data.ca_id) {
    references.push({
      origin: { type: 'cash_advance', id: String(data.ca_id) },
      relation: 'funded_by_cash_advance',
    });
  }

  if (type === 'reimbursement') {
    if (data.liquidationId) {
      references.push({
        origin: { type: 'liquidation', id: String(data.liquidationId) },
        relation: 'reimbursed_by',
      });
    }
    if (data.caId) {
      references.push({
        origin: { type: 'cash_advance', id: String(data.caId) },
        relation: 'funded_by_cash_advance',
      });
    }
  }

  return references;
}

function isProtectedExpense(data = {}) {
  return PROTECTED_SOURCE_TYPES.has(data.sourceType)
    || Boolean(data.sourcePoId)
    || Boolean(data.sourceLiquidationId)
    || Boolean(data.sourcePayrollId);
}

function textWords(value) {
  return new Set(String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word)));
}

function matchingWords(a, b) {
  const left = textWords(a);
  const right = textWords(b);
  return [...left].filter((word) => right.has(word)).sort();
}

function candidateFields(record) {
  const data = record.data || {};
  const row = record.row || {};
  return {
    date: dateValue(row.date || data.date || data.date_of_submission || data.createdAt || data.created_at),
    amount: numberValue(row.amount, data.amount, data.total_amount),
    text: stringValue(
      row.particulars, row.description, data.description, data.remarks,
      data.purpose, data.form_no, data.formNo, data.category,
    ) || '',
    projectId: stringValue(row.projectId, row.project_id, data.projectId, data.project_id),
    investor: stringValue(data.investor, data.employeeName, data.employee_name),
    supplier: stringValue(row.supplier, data.supplier),
    invoice: stringValue(row.invoiceNo, row.invoice_no, data.invoiceNo, data.invoice_no),
    receipt: stringValue(row.receiptRef?.oneDriveId, data.receiptRef?.oneDriveId),
    sourceRef: stringValue(data.sourcePoId, data.sourceLiquidationId, data.sourceExpenseId),
  };
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  const left = new Date(`${a}T00:00:00Z`).getTime();
  const right = new Date(`${b}T00:00:00Z`).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return null;
  return Math.round(Math.abs(left - right) / 86400000);
}

function relationFor(origin, candidate) {
  if (origin.type === 'investment' && candidate.type === 'expense') return 'recorded_as_expense';
  if (origin.type === 'expense' && candidate.type === 'investment') return 'funded_by';
  if (origin.type === 'expense' && candidate.type === 'liquidation') return 'liquidated_by';
  if (origin.type === 'liquidation' && candidate.type === 'expense') return 'liquidated_by';
  if (candidate.type === 'cash_advance' || origin.type === 'cash_advance') return 'funded_by_cash_advance';
  return 'reimbursed_by';
}

function confirmedIds(record) {
  const data = record.data || {};
  return new Set([
    data.sourceExpenseId,
    data.linkedExpenseId,
    data.linkedInvestmentId,
    data.fundingSource?.linkedInvestmentId,
    data.sourceLiquidationId,
    data.sourceCaId,
    data.ca_id,
    data.caId,
    data.liquidationId,
  ].filter(Boolean).map(String));
}

function rankCandidates(origin, candidates) {
  const originValues = candidateFields(origin);
  const excludedIds = confirmedIds(origin);
  const originKeyValue = nodeKey(origin);

  return (candidates || []).flatMap((candidate) => {
    if (!candidate || !candidate.id || nodeKey(candidate) === originKeyValue) return [];
    if (excludedIds.has(String(candidate.id))) return [];

    const values = candidateFields(candidate);
    const evidence = [];
    let score = 0;
    let signals = 0;

    if (originValues.amount !== undefined && values.amount !== undefined) {
      const differenceCents = Math.abs(
        Math.round(originValues.amount * 100) - Math.round(values.amount * 100),
      );
      if (differenceCents <= 50000) {
        const difference = differenceCents / 100;
        evidence.push(`amount within ₱${difference.toFixed(2)}`);
        score += differenceCents === 0 ? 40 : Math.max(10, 35 - Math.floor(difference / 20));
        signals += 1;
      }
    }

    const dayDistance = daysBetween(originValues.date, values.date);
    if (dayDistance !== null && dayDistance <= 14) {
      evidence.push(`date within ${dayDistance} ${dayDistance === 1 ? 'day' : 'days'}`);
      score += Math.max(6, 20 - dayDistance);
      signals += 1;
    }

    const words = matchingWords(originValues.text, values.text);
    if (words.length >= 2) {
      evidence.push(`matching words: ${words.slice(0, 4).join(', ')}`);
      score += Math.min(20, words.length * 5);
      signals += 1;
    }

    const exactSignals = [
      ['project', originValues.projectId, values.projectId, 14],
      ['investor', originValues.investor, values.investor, 12],
      ['supplier', originValues.supplier, values.supplier, 12],
      ['invoice', originValues.invoice, values.invoice, 25],
      ['receipt', originValues.receipt, values.receipt, 30],
      ['source reference', originValues.sourceRef, values.sourceRef, 30],
    ];
    for (const [label, left, right, points] of exactSignals) {
      if (left && right && String(left).toLowerCase() === String(right).toLowerCase()) {
        evidence.push(`same ${label}`);
        score += points;
        signals += 1;
      }
    }

    if (signals < 2) return [];
    const isInvestmentExpense = new Set([origin.type, candidate.type]).has('investment')
      && new Set([origin.type, candidate.type]).has('expense');
    return [{
      node: normalizeRecord(candidate),
      proposedRelation: relationFor(origin, candidate),
      score,
      evidence,
      needsReview: true,
      confirmable: isInvestmentExpense,
    }];
  }).sort((left, right) => right.score - left.score || left.node.key.localeCompare(right.node.key))
    .slice(0, 5);
}

module.exports = {
  confirmedReferences,
  focusToken,
  focusUrl,
  isProtectedExpense,
  nodeKey,
  normalizeRecord,
  parseLiquidationRows,
  rankCandidates,
};
