'use strict';

const crypto = require('crypto');

const ENTRY_TYPES = new Set([
  'founder_advance',
  'capital_contribution',
  'repayment',
  'capitalization',
  'opening_balance_adjustment',
]);

const SETTLEMENT_TYPES = new Set(['repayment', 'capitalization']);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertBoundedText(value, label, maxLength, { required = true } = {}) {
  if ((!isNonEmptyString(value) && required) || (value != null && typeof value !== 'string')) {
    throw new Error(`${label} is required`);
  }
  if (typeof value === 'string' && value.trim().length > maxLength) {
    throw new Error(`${label} must be at most ${maxLength} characters`);
  }
}

function assertCentavos(value, label = 'Amount') {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive centavo value`);
  }
}

function addCentavos(left, right, label = 'Aggregate amount') {
  const total = left + right;
  if (!Number.isSafeInteger(total)) {
    throw new Error(`${label} must remain a safe integer centavo value`);
  }
  return total;
}

function phpToCentavos(value) {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
      throw new Error('Amount must be a positive PHP value with at most two decimal places');
    }
    const [pesos, fraction = ''] = normalized.split('.');
    const centavos = Number(pesos) * 100 + Number(fraction.padEnd(2, '0'));
    assertCentavos(centavos);
    return centavos;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error('Amount must be greater than zero');
  }
  const centavos = Math.round(value * 100);
  if (Math.abs(value * 100 - centavos) > Number.EPSILON * Math.max(1, Math.abs(value * 100))) {
    throw new Error('Amount must have at most two decimal places');
  }
  assertCentavos(centavos);
  return centavos;
}

function remainingCentavos(advanceCentavos, settlementCentavos) {
  assertCentavos(advanceCentavos, 'Advance amount');
  if (!Array.isArray(settlementCentavos)) {
    throw new Error('Settlements must be an array of centavo values');
  }
  const settled = settlementCentavos.reduce((sum, value) => {
    assertCentavos(value, 'Settlement amount');
    return addCentavos(sum, value, 'Settlement aggregate');
  }, 0);
  if (!Number.isSafeInteger(settled) || settled > advanceCentavos) {
    throw new Error('Settlement amounts exceed the founder advance');
  }
  return advanceCentavos - settled;
}

function validateSettlement({ outstandingCentavos, amountCentavos } = {}) {
  if (!Number.isSafeInteger(outstandingCentavos) || outstandingCentavos <= 0) {
    throw new Error('Founder advance has no positive outstanding balance');
  }
  assertCentavos(amountCentavos, 'Settlement amount');
  if (amountCentavos > outstandingCentavos) {
    throw new Error('Settlement amount exceeds the outstanding founder advance');
  }
}

function isRecognizedFounder(userId, founderIds) {
  return isNonEmptyString(userId) && Array.isArray(founderIds) && founderIds.includes(userId);
}

function validateSource(source) {
  if (!source || typeof source !== 'object') throw new Error('Invalid funding source');
  if (source.kind === 'liquidation') {
    assertBoundedText(source.liquidationId, 'liquidationId', 200);
    assertBoundedText(source.liquidationFormNo, 'liquidationFormNo', 100, { required: false });
    return;
  }
  if (source.kind === 'cash_deposit') {
    assertBoundedText(source.depositReference, 'depositReference', 500, { required: false });
    return;
  }
  if (source.kind === 'legacy_reconciliation') {
    assertBoundedText(source.reconciliationId, 'reconciliationId', 200, { required: false });
    return;
  }
  throw new Error('Invalid funding source');
}

function liquidationSourceKey(liquidationId, rowId) {
  if (!isNonEmptyString(liquidationId)) throw new Error('liquidationId is required');
  return `liquidation:${liquidationId.trim()}`;
}

function validateCapitalization({ resolutionReference } = {}) {
  if (!isNonEmptyString(resolutionReference)) {
    throw new Error('Capitalization requires a resolution or approval reference');
  }
  assertBoundedText(resolutionReference, 'Resolution reference', 500);
}

function newAuditFields(userId, now) {
  if (!isNonEmptyString(userId)) throw new Error('Creating user is required');
  if (!isNonEmptyString(now)) throw new Error('Creation time is required');
  return { createdAt: now, createdBy: userId, status: 'posted' };
}

function classifyNoCaLiquidation({ isFounder, treatment, capitalizationReference } = {}) {
  if (!isFounder) return 'reimbursement';
  if (treatment === 'capital_contribution') {
    validateCapitalization({ resolutionReference: capitalizationReference });
    return 'capital_contribution';
  }
  if (treatment == null || treatment === '' || treatment === 'company_owes_founder') {
    return 'founder_advance';
  }
  throw new Error('Invalid founder payment treatment');
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function cleanSource(source) {
  const allowed = source.kind === 'liquidation'
    ? ['kind', 'liquidationId', 'liquidationFormNo']
    : source.kind === 'cash_deposit'
      ? ['kind', 'depositReference']
      : ['kind', 'reconciliationId'];
  return Object.fromEntries(allowed
    .filter(key => source[key] !== undefined)
    .map(key => [key, typeof source[key] === 'string' ? source[key].trim() : source[key]]));
}

function buildLedgerEntry(input = {}) {
  if (!ENTRY_TYPES.has(input.entryType)) throw new Error('Invalid founder funding entry type');
  assertBoundedText(input.founderId, 'Founder id', 200);
  assertBoundedText(input.founderName, 'Founder name', 200);
  if (!isIsoDate(input.transactionDate)) throw new Error('A valid transaction date is required');
  assertBoundedText(input.description, 'Description', 1000);
  validateSource(input.source);

  const amountCentavos = input.amountCentavos == null
    ? phpToCentavos(input.amount)
    : input.amountCentavos;
  assertCentavos(amountCentavos);

  if (SETTLEMENT_TYPES.has(input.entryType) && !isNonEmptyString(input.settlesEntryId)) {
    throw new Error('settlesEntryId is required for a settlement entry');
  }
  if (input.entryType === 'capitalization' || input.entryType === 'capital_contribution') validateCapitalization(input);

  if (input.proofRefs != null && !Array.isArray(input.proofRefs)) throw new Error('Proof references must be an array');
  if (Array.isArray(input.proofRefs) && input.proofRefs.length > 20) throw new Error('Proof references are limited to 20 items');
  const proofRefs = Array.isArray(input.proofRefs)
    ? input.proofRefs.filter(isNonEmptyString).map(value => {
      assertBoundedText(value, 'Proof reference', 2000);
      return value.trim();
    })
    : [];
  const entry = {
    transactionDate: input.transactionDate,
    founderId: input.founderId.trim(),
    founderName: input.founderName.trim(),
    entryType: input.entryType,
    amountCentavos,
    currency: 'PHP',
    description: input.description.trim(),
    source: cleanSource(input.source),
    proofRefs,
    ...newAuditFields(input.userId, input.now),
  };

  if (SETTLEMENT_TYPES.has(input.entryType)) entry.settlesEntryId = input.settlesEntryId.trim();
  if (input.entryType === 'founder_advance' || input.entryType === 'opening_balance_adjustment') {
    entry.settledCentavos = 0;
  }
  if (input.entryType === 'capitalization' || input.entryType === 'capital_contribution') {
    entry.resolutionReference = input.resolutionReference.trim();
    entry.approvedAt = input.approvedAt || input.now;
    entry.approvedBy = isNonEmptyString(input.approvedBy) ? input.approvedBy.trim() : input.userId.trim();
  }
  return entry;
}

function inPeriod(date, periodStart, periodEnd) {
  if (!periodStart && !periodEnd) return true;
  if (!isIsoDate(date)) return false;
  return (!periodStart || date >= periodStart) && (!periodEnd || date <= periodEnd);
}

function blankFounderSummary() {
  return {
    advancesOutstandingCentavos: 0,
    capitalContributedCentavos: 0,
    repaidThisPeriodCentavos: 0,
  };
}

function summarizeFounderLedger(entries, { periodStart, periodEnd } = {}) {
  if (!Array.isArray(entries)) throw new Error('Ledger entries must be an array');
  if (periodStart && !isIsoDate(periodStart)) throw new Error('Invalid period start date');
  if (periodEnd && !isIsoDate(periodEnd)) throw new Error('Invalid period end date');

  const posted = entries.filter(entry => entry.status === 'posted');
  const advances = new Map();
  const perFounder = {};

  for (const entry of posted) {
    assertCentavos(entry.amountCentavos);
    if (!isNonEmptyString(entry.founderId)) throw new Error('Ledger entry founderId is required');
    if (!perFounder[entry.founderId]) perFounder[entry.founderId] = blankFounderSummary();
    if (entry.entryType === 'founder_advance' || entry.entryType === 'opening_balance_adjustment') {
      if (!isNonEmptyString(entry.id)) throw new Error('Advance entry id is required');
      advances.set(entry.id, { entry, settlements: [] });
    }
  }

  for (const entry of posted) {
    const founder = perFounder[entry.founderId];
    if (entry.entryType === 'capital_contribution') {
      founder.capitalContributedCentavos = addCentavos(
        founder.capitalContributedCentavos,
        entry.amountCentavos,
        'Capital contribution aggregate',
      );
    } else if (SETTLEMENT_TYPES.has(entry.entryType)) {
      const advance = advances.get(entry.settlesEntryId);
      if (!advance) throw new Error('Settlement references an unknown advance');
      if (advance.entry.founderId !== entry.founderId) {
        throw new Error('Settlement founder does not match the source advance');
      }
      advance.settlements.push(entry.amountCentavos);
      if (entry.entryType === 'capitalization') {
        founder.capitalContributedCentavos = addCentavos(
          founder.capitalContributedCentavos,
          entry.amountCentavos,
          'Capital contribution aggregate',
        );
      } else if (inPeriod(entry.transactionDate, periodStart, periodEnd)) {
        founder.repaidThisPeriodCentavos = addCentavos(
          founder.repaidThisPeriodCentavos,
          entry.amountCentavos,
          'Repayment aggregate',
        );
      }
    } else if (entry.entryType !== 'founder_advance' && entry.entryType !== 'opening_balance_adjustment') {
      throw new Error('Invalid founder funding entry type');
    }
  }

  for (const { entry, settlements } of advances.values()) {
    const founder = perFounder[entry.founderId];
    founder.advancesOutstandingCentavos = addCentavos(
      founder.advancesOutstandingCentavos,
      remainingCentavos(entry.amountCentavos, settlements),
      'Founder advance aggregate',
    );
  }

  return Object.values(perFounder).reduce((summary, founder) => ({
    advancesOutstandingCentavos: addCentavos(summary.advancesOutstandingCentavos, founder.advancesOutstandingCentavos, 'Advance summary aggregate'),
    capitalContributedCentavos: addCentavos(summary.capitalContributedCentavos, founder.capitalContributedCentavos, 'Capital summary aggregate'),
    repaidThisPeriodCentavos: addCentavos(summary.repaidThisPeriodCentavos, founder.repaidThisPeriodCentavos, 'Repayment summary aggregate'),
    perFounder,
  }), {
    advancesOutstandingCentavos: 0,
    capitalContributedCentavos: 0,
    repaidThisPeriodCentavos: 0,
    perFounder,
  });
}

function buildLiquidationExpenseDocs({ liquidationId, formNo, userId, createdAt, rows } = {}) {
  if (!isNonEmptyString(liquidationId)) throw new Error('liquidationId is required');
  if (!isNonEmptyString(userId)) throw new Error('Creating user is required');
  if (!isNonEmptyString(createdAt)) throw new Error('Creation time is required');
  if (!Array.isArray(rows)) throw new Error('Liquidation rows must be an array');
  return rows.filter(row => row && row.projectId !== '' && row.projectId != null && Number(row.amount) > 0)
    .map(row => {
      if (!isNonEmptyString(row.id)) throw new Error('Each project liquidation row needs a stable id');
      const description = `${formNo ? `Liquidation ${formNo}: ` : ''}${isNonEmptyString(row.particulars) ? row.particulars.trim() : 'Liquidation'}`;
      const amountCentavos = phpToCentavos(row.amount);
      const data = {
        projectId: String(row.projectId),
        projectName: isNonEmptyString(row.projectName) ? row.projectName.trim() : '—',
        description,
        amount: amountCentavos / 100,
        date: isNonEmptyString(row.date) ? row.date : createdAt.slice(0, 10),
        category: isNonEmptyString(row.category) ? row.category.trim() : 'Others',
        createdAt,
        createdBy: userId,
        sourceType: 'liquidation_sync',
        sourceLiquidationId: liquidationId,
        sourceLiquidationRowId: row.id,
      };
      if (isNonEmptyString(row.remarks)) data.remarks = row.remarks.trim();
      if (isNonEmptyString(row.supplier)) data.supplier = row.supplier.trim();
      if (isNonEmptyString(row.invoiceNo)) data.invoiceNo = row.invoiceNo.trim();
      if (typeof row.deductible === 'boolean') data.deductible = row.deductible;
      if (isNonEmptyString(row.deductibleReason)) data.deductibleReason = row.deductibleReason.trim();
      const digest = crypto.createHash('sha256').update(`${liquidationId}:${row.id}`).digest('hex').slice(0, 40);
      return { id: `liquidation_${digest}`, data };
    });
}

function sumLiquidationRowsCentavos(rows) {
  if (!Array.isArray(rows)) throw new Error('Liquidation rows must be an array');
  return rows.reduce((total, row) => {
    const value = row && row.amount;
    if (value == null || value === '' || Number(value) === 0) return total;
    return addCentavos(total, phpToCentavos(value), 'Liquidation total aggregate');
  }, 0);
}

function validateLiquidationRows(rows) {
  if (!Array.isArray(rows)) throw new Error('Liquidation rows must be an array');
  if (rows.length > 450) throw new Error('Liquidation must contain at most 450 rows');
  const ids = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object') throw new Error('Each liquidation row must be an object');
    if (!isNonEmptyString(row.id)) throw new Error('Each liquidation row needs a stable id');
    assertBoundedText(row.id, 'Liquidation row id', 200);
    if (row.id !== row.id.trim()) throw new Error('Liquidation row ids cannot have surrounding whitespace');
    if (ids.has(row.id)) throw new Error('Liquidation row ids must be unique');
    ids.add(row.id);
    if (row.projectId != null && String(row.projectId).length > 200) throw new Error('Liquidation row projectId must be at most 200 characters');
    if (isNonEmptyString(row.date) && !isIsoDate(row.date)) throw new Error('Liquidation row date must be YYYY-MM-DD');
    for (const field of ['particulars', 'remarks', 'supplier', 'invoiceNo', 'projectName', 'category']) {
      assertBoundedText(row[field], `Liquidation row ${field}`, 2000, { required: false });
    }
  }
}

module.exports = {
  ENTRY_TYPES,
  phpToCentavos,
  remainingCentavos,
  validateSettlement,
  isRecognizedFounder,
  validateSource,
  liquidationSourceKey,
  validateCapitalization,
  newAuditFields,
  classifyNoCaLiquidation,
  buildLedgerEntry,
  summarizeFounderLedger,
  buildLiquidationExpenseDocs,
  sumLiquidationRowsCentavos,
  validateLiquidationRows,
};
