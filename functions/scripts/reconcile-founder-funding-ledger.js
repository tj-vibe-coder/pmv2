'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const AMOUNT_TOLERANCE_CENTAVOS = 100;

function toCentavos(value) {
  if (Number.isSafeInteger(value) && value > Number.MAX_SAFE_INTEGER / 100) {
    throw new Error('Amount is outside the supported range');
  }
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error(`Invalid PHP amount: ${text || '(empty)'}`);
  const [whole, fraction = ''] = text.split('.');
  const centavos = (Number(whole) * 100) + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(centavos)) throw new Error('Amount is outside the supported range');
  return centavos;
}

function normalizeProjectId(value) {
  return String(value ?? '').trim().toLowerCase().replace(/^project[_\s-]*/, '');
}

function normalizeWords(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

function descriptionSimilarity(left, right) {
  const leftWords = new Set(normalizeWords(left));
  const rightWords = new Set(normalizeWords(right));
  if (!leftWords.size || !rightWords.size) return 0;
  const intersection = [...leftWords].filter((word) => rightWords.has(word)).length;
  const union = new Set([...leftWords, ...rightWords]).size;
  return intersection / union;
}

function founderNamesMatch(left, right) {
  const leftWords = normalizeWords(left);
  const rightWords = normalizeWords(right);
  if (!leftWords.length || !rightWords.length) return false;
  const leftSurname = leftWords.at(-1);
  const rightSurname = rightWords.at(-1);
  return leftSurname === rightSurname && leftWords[0][0] === rightWords[0][0];
}

function dateDifferenceDays(left, right) {
  const leftMs = Date.parse(`${left}T00:00:00Z`);
  const rightMs = Date.parse(`${right}T00:00:00Z`);
  if (!Number.isFinite(leftMs) || !Number.isFinite(rightMs)) return null;
  return Math.round(Math.abs(leftMs - rightMs) / 86_400_000);
}

function recordAmountCentavos(record) {
  if (Number.isSafeInteger(record.amountCentavos) && record.amountCentavos > 0) return record.amountCentavos;
  return toCentavos(record.amount);
}

function scoreCandidate(investment, candidate) {
  const amountDifferenceCentavos = Math.abs(recordAmountCentavos(investment) - recordAmountCentavos(candidate));
  const amountWithinTolerance = amountDifferenceCentavos <= AMOUNT_TOLERANCE_CENTAVOS;
  const daysApart = dateDifferenceDays(investment.date, candidate.date);
  const dateMatch = daysApart === 0;
  const descriptionScore = descriptionSimilarity(investment.description, candidate.description);
  const investmentProject = normalizeProjectId(investment.projectId);
  const candidateProject = normalizeProjectId(candidate.projectId);
  const projectMatch = Boolean(investmentProject && candidateProject && investmentProject === candidateProject);
  const founderMatch = Boolean(
    investment.founderId
      && candidate.founderId
      && investment.founderId === candidate.founderId,
  ) || founderNamesMatch(
    investment.investor || investment.founderName,
    candidate.investor || candidate.founderName,
  );

  const score = Math.round(
    (amountWithinTolerance ? 50 : 0)
      + (dateMatch ? 25 : daysApart !== null && daysApart <= 3 ? 10 : 0)
      + (descriptionScore * 20)
      + (projectMatch ? 5 : 0)
      + (founderMatch ? 10 : 0),
  );
  const isCandidate = amountWithinTolerance && score >= 60;

  return {
    score,
    isCandidate,
    confidence: score >= 85 ? 'high' : score >= 70 ? 'medium' : 'low',
    amountDifferenceCentavos,
    amountWithinTolerance,
    daysApart,
    dateMatch,
    descriptionSimilarity: descriptionScore,
    projectMatch,
    founderMatch,
    requiresReview: true,
    autoApply: false,
    sourceIds: {
      investmentId: investment.id,
      candidateId: candidate.id,
    },
  };
}

function parseLiquidationRows(liquidation) {
  if (Array.isArray(liquidation.rows)) return liquidation.rows;
  if (Array.isArray(liquidation.rows_json)) return liquidation.rows_json;
  if (typeof liquidation.rows_json !== 'string') return [];
  try {
    const rows = JSON.parse(liquidation.rows_json);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function findReconciliationCandidates({ investments = [], liquidations = [], projectExpenses = [] } = {}) {
  const rows = liquidations.flatMap((liquidation) => parseLiquidationRows(liquidation).map((row) => ({
    ...row,
    id: row.id,
    description: row.particulars || row.description || '',
    founderId: liquidation.user_id || liquidation.founderId,
    founderName: liquidation.employee_name || liquidation.founderName,
    liquidationId: liquidation.id,
    liquidationFormNo: liquidation.form_no,
  })));

  const results = [];
  for (const investment of investments) {
    for (const row of rows) {
      const scored = scoreCandidate({
        ...investment,
        projectId: investment.projectId || investment.linkedExpenseProjectId,
      }, row);
      if (!scored.isCandidate) continue;

      const canonicalExpenseIds = projectExpenses
        .filter((expense) => expense.sourceLiquidationId === row.liquidationId
          && expense.sourceLiquidationRowId === row.id)
        .map((expense) => expense.id)
        .filter(Boolean)
        .sort();
      const manualExpenseIds = projectExpenses
        .filter((expense) => expense.id === investment.linkedExpenseId && !canonicalExpenseIds.includes(expense.id))
        .map((expense) => expense.id)
        .filter(Boolean)
        .sort();

      results.push({
        score: scored.score,
        confidence: scored.confidence,
        evidence: scored,
        requiresReview: true,
        autoApply: false,
        proposedAction: canonicalExpenseIds.length && manualExpenseIds.length
          ? 'void_manual_expense_and_open_founder_advance'
          : 'review_possible_duplicate',
        sourceIds: {
          investmentId: investment.id,
          liquidationId: row.liquidationId,
          liquidationRowId: row.id,
          canonicalExpenseIds,
          manualExpenseIds,
          founderId: row.founderId,
        },
      });
    }

    const representedExpenseIds = new Set(results
      .filter((result) => result.sourceIds.investmentId === investment.id)
      .flatMap((result) => [
        ...(result.sourceIds.canonicalExpenseIds || []),
        ...(result.sourceIds.manualExpenseIds || []),
      ]));
    for (const expense of projectExpenses) {
      if (representedExpenseIds.has(expense.id)) continue;
      const scored = scoreCandidate({
        ...investment,
        projectId: investment.projectId || investment.linkedExpenseProjectId,
      }, expense);
      if (!scored.isCandidate) continue;
      results.push({
        score: scored.score,
        confidence: scored.confidence,
        evidence: scored,
        requiresReview: true,
        autoApply: false,
        proposedAction: 'review_investment_expense_link',
        sourceIds: {
          investmentId: investment.id,
          projectExpenseId: expense.id,
          liquidationId: expense.sourceLiquidationId || null,
          liquidationRowId: expense.sourceLiquidationRowId || null,
        },
      });
    }
  }

  return results.sort((left, right) => right.score - left.score);
}

function presentReconciliationCandidate(candidate, { investments = [], liquidations = [], index = 0 } = {}) {
  const source = candidate.sourceIds || {};
  const liquidation = liquidations.find(item => item.id === source.liquidationId);
  const row = liquidation
    ? parseLiquidationRows(liquidation).find(item => item.id === source.liquidationRowId)
    : null;
  const investment = investments.find(item => item.id === source.investmentId) || {};
  const liquidationAmountCentavos = row ? recordAmountCentavos(row) : null;
  const legacyAmountCentavos = source.investmentId ? recordAmountCentavos(investment) : null;
  const manualExpenseIds = [...new Set([
    ...(source.manualExpenseIds || []),
    ...(source.projectExpenseId ? [source.projectExpenseId] : []),
  ])];

  return {
    id: `${source.investmentId || 'investment'}:${source.liquidationId || 'expense'}:${source.liquidationRowId || source.projectExpenseId || index}`,
    founderId: source.founderId || liquidation?.user_id || null,
    founderName: liquidation?.employee_name || investment.investor || null,
    liquidationId: source.liquidationId || '',
    liquidationFormNo: liquidation?.form_no || null,
    sourceLabel: liquidation ? (liquidation.form_no || source.liquidationId || 'Liquidation') : 'Legacy expense match',
    transactionDate: row?.date || investment.date || null,
    description: row?.particulars || investment.description || 'Possible duplicate',
    reviewAmountCentavos: liquidationAmountCentavos ?? legacyAmountCentavos ?? 0,
    liquidationAmountCentavos,
    legacyAmountCentavos,
    amountDifferenceCentavos: candidate.evidence?.amountDifferenceCentavos ?? null,
    confidence: candidate.confidence,
    manualExpenseIds,
    legacyInvestmentIds: source.investmentId ? [source.investmentId] : [],
    proposedAction: candidate.proposedAction,
    evidence: [source.liquidationRowId, ...(source.canonicalExpenseIds || [])].filter(Boolean),
    status: 'needs_review',
  };
}

const ACTION_NAME = 'void_manual_expense_and_open_founder_advance';
const ACTION_FIELDS = new Set([
  'action',
  'liquidationId',
  'liquidationRowIds',
  'canonicalExpenseIds',
  'manualExpenseIds',
  'legacyInvestmentIds',
  'founderId',
  'amountCentavos',
  'reviewedBy',
  'reviewedAt',
  'reason',
  'confirmedNotReimbursed',
  'confirmedNotCapitalized',
]);

function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string`);
}

function validateIdArray(value, field) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${field} must be a non-empty array`);
  value.forEach((id, index) => requireNonEmptyString(id, `${field}[${index}]`));
  if (new Set(value).size !== value.length) throw new Error(`${field} values must be unique`);
}

function validateApprovedActions(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Approved actions file must contain a JSON object');
  }
  const unknownEnvelopeFields = Object.keys(payload).filter((key) => !['schemaVersion', 'approvedActions'].includes(key));
  if (unknownEnvelopeFields.length) throw new Error(`Unknown approved-actions field: ${unknownEnvelopeFields[0]}`);
  if (payload.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  if (!Array.isArray(payload.approvedActions) || payload.approvedActions.length === 0) {
    throw new Error('approvedActions must be a non-empty array');
  }

  const usedIds = new Map();
  payload.approvedActions.forEach((action, actionIndex) => {
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      throw new Error(`approvedActions[${actionIndex}] must be an object`);
    }
    const unknownFields = Object.keys(action).filter((key) => !ACTION_FIELDS.has(key));
    if (unknownFields.length) throw new Error(`Unknown action field: ${unknownFields[0]}`);
    if (action.action !== ACTION_NAME) throw new Error(`action must be ${ACTION_NAME}`);

    for (const field of ['liquidationId', 'founderId', 'reviewedBy', 'reason']) {
      requireNonEmptyString(action[field], field);
    }
    for (const field of ['liquidationRowIds', 'canonicalExpenseIds', 'manualExpenseIds', 'legacyInvestmentIds']) {
      validateIdArray(action[field], field);
      for (const id of action[field]) {
        const reuseKey = `${field}:${id}`;
        if (usedIds.has(reuseKey)) throw new Error(`${field} id ${id} appears in more than one action`);
        usedIds.set(reuseKey, actionIndex);
      }
    }
    if (!Number.isSafeInteger(action.amountCentavos) || action.amountCentavos <= 0) {
      throw new Error('amountCentavos must be a positive safe integer');
    }
    if (action.reason.trim().length < 12) throw new Error('reason must be at least 12 characters');
    if (typeof action.reviewedAt !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(action.reviewedAt)
      || Number.isNaN(Date.parse(action.reviewedAt))) {
      throw new Error('reviewedAt must be a valid ISO-8601 UTC timestamp');
    }
    if (action.confirmedNotReimbursed !== true) {
      throw new Error('confirmedNotReimbursed must be true');
    }
    if (action.confirmedNotCapitalized !== true) {
      throw new Error('confirmedNotCapitalized must be true');
    }
  });

  return payload;
}

function parseCliArguments(argv) {
  if (!Array.isArray(argv)) throw new Error('CLI arguments must be an array');
  if (argv.length === 0) return { mode: 'dry-run', approvedActionsPath: null };
  if (argv[0] === '--apply') {
    throw new Error('Reconciliation apply mode is disabled; this tool is review-only');
  }
  throw new Error(`Unknown argument: ${argv[0]}`);
}

async function runReconciliation({ argv = [], loadData }) {
  const cli = parseCliArguments(argv);
  if (typeof loadData !== 'function') throw new Error('loadData is required');
  const data = await loadData();
  const candidates = findReconciliationCandidates(data);
  return { mode: cli.mode, candidates, applied: [] };
}

function reconciliationIdFor(action) {
  const identity = JSON.stringify({
    liquidationId: action.liquidationId,
    liquidationRowIds: [...action.liquidationRowIds].sort(),
    manualExpenseIds: [...action.manualExpenseIds].sort(),
    legacyInvestmentIds: [...action.legacyInvestmentIds].sort(),
  });
  return `founder-funding-${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
}

function createFirestoreAdapter() {
  // Firebase is deliberately required and initialized only when the CLI runs.
  // Unit tests import this module without opening a network connection.
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'pmv2-851ae' });
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
    } else {
      const localKey = path.join(__dirname, '..', 'pmv2-851ae-firebase-adminsdk-fbsvc-c4d13e6cb1.json');
      if (!fs.existsSync(localKey)) {
        throw new Error('No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT or FIRESTORE_EMULATOR_HOST.');
      }
      admin.initializeApp({ credential: admin.credential.cert(require(localKey)) });
    }
  }
  const db = admin.firestore();

  async function readCollection(collectionName) {
    const snapshot = await db.collection(collectionName).get();
    return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
  }

  async function loadData() {
    const [investments, liquidations, projectExpenses] = await Promise.all([
      readCollection('investments'),
      readCollection('liquidations'),
      readCollection('project_expenses'),
    ]);
    return { investments, liquidations, projectExpenses };
  }

  async function applyActions(actions) {
    void actions;
    throw new Error('Reconciliation apply mode is disabled; this tool is review-only');
  }

  return { loadData, applyActions };
}

function loadApprovedActionsFile(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`Approved actions file not found: ${absolutePath}`);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

async function main() {
  const adapter = createFirestoreAdapter();
  const report = await runReconciliation({
    argv: process.argv.slice(2),
    loadData: adapter.loadData,
    loadApprovedActions: loadApprovedActionsFile,
    applyActions: adapter.applyActions,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Reconciliation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  AMOUNT_TOLERANCE_CENTAVOS,
  createFirestoreAdapter,
  findReconciliationCandidates,
  presentReconciliationCandidate,
  loadApprovedActionsFile,
  parseCliArguments,
  reconciliationIdFor,
  runReconciliation,
  scoreCandidate,
  validateApprovedActions,
};
