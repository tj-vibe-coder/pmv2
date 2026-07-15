const test = require('node:test');
const assert = require('node:assert/strict');

const {
  findReconciliationCandidates,
  parseCliArguments,
  runReconciliation,
  scoreCandidate,
  validateApprovedActions,
  presentReconciliationCandidate,
} = require('./reconcile-founder-funding-ledger');

test('scores the LQ-001 airfare within one peso as review-only evidence', () => {
  const result = scoreCandidate(
    {
      id: 'investment-airfare',
      date: '2026-02-10',
      amount: 5807,
      description: 'Cebu Pacific MNL to Ceb',
      investor: 'TJ Caballero',
      projectId: 'project_5',
    },
    {
      id: 'liquidation-row-airfare',
      date: '2026-02-10',
      amount: 5807.44,
      description: 'Cebu Pacific Flight',
      founderName: 'Tyrone James Caballero',
      projectId: '5',
    },
  );

  assert.equal(result.amountDifferenceCentavos, 44);
  assert.equal(result.amountWithinTolerance, true);
  assert.equal(result.projectMatch, true);
  assert.equal(result.requiresReview, true);
  assert.equal(result.autoApply, false);
  assert.deepEqual(result.sourceIds, {
    investmentId: 'investment-airfare',
    candidateId: 'liquidation-row-airfare',
  });
});

test('does not consider an amount outside the one-peso tolerance a likely match', () => {
  const result = scoreCandidate(
    { id: 'investment-1', date: '2026-02-10', amount: 5807, description: 'Cebu Pacific Flight' },
    { id: 'row-1', date: '2026-02-10', amount: 5808.01, description: 'Cebu Pacific Flight' },
  );

  assert.equal(result.amountDifferenceCentavos, 101);
  assert.equal(result.amountWithinTolerance, false);
  assert.equal(result.isCandidate, false);
});

test('scores records that already store exact centavo amounts', () => {
  const result = scoreCandidate(
    { id: 'inv-1', date: '2026-02-10', amountCentavos: 580700, description: 'Flight' },
    { id: 'row-1', date: '2026-02-10', amountCentavos: 580744, description: 'Flight' },
  );
  assert.equal(result.amountDifferenceCentavos, 44);
  assert.equal(result.isCandidate, true);
});

test('groups an investment with its liquidation row and canonical and manual expenses', () => {
  const candidates = findReconciliationCandidates({
    investments: [{
      id: 'inv-1',
      date: '2026-02-10',
      amount: 5807,
      description: 'Cebu Pacific MNL to Ceb',
      investor: 'TJ Caballero',
      linkedExpenseId: 'expense-manual',
      linkedExpenseProjectId: 'project_5',
    }],
    liquidations: [{
      id: 'liq-1',
      form_no: 'LQ-001',
      user_id: 'user_6',
      employee_name: 'Tyrone James Caballero',
      rows_json: JSON.stringify([{
        id: 'liq-row-1',
        date: '2026-02-10',
        amount: 5807.44,
        particulars: 'Cebu Pacific Flight',
        projectId: '5',
      }]),
    }],
    projectExpenses: [
      {
        id: 'expense-canonical',
        amount: 5807.44,
        sourceType: 'liquidation_sync',
        sourceLiquidationId: 'liq-1',
        sourceLiquidationRowId: 'liq-row-1',
      },
      {
        id: 'expense-manual',
        amount: 5807,
        sourceType: 'manual',
        projectId: 'project_5',
      },
    ],
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].requiresReview, true);
  assert.equal(candidates[0].proposedAction, 'void_manual_expense_and_open_founder_advance');
  assert.deepEqual(candidates[0].sourceIds, {
    investmentId: 'inv-1',
    liquidationId: 'liq-1',
    liquidationRowId: 'liq-row-1',
    canonicalExpenseIds: ['expense-canonical'],
    manualExpenseIds: ['expense-manual'],
    founderId: 'user_6',
  });
});

test('ignores invalid liquidation row JSON without hiding valid records', () => {
  const candidates = findReconciliationCandidates({
    investments: [{ id: 'inv-1', date: '2026-02-10', amount: 100, description: 'Fuel' }],
    liquidations: [
      { id: 'broken', rows_json: '{not-json' },
      { id: 'valid', rows_json: '[{"id":"row-1","date":"2026-02-10","amount":100,"particulars":"Fuel"}]' },
    ],
    projectExpenses: [],
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].sourceIds.liquidationId, 'valid');
});

test('reports a review candidate when an investment matches a project expense without a liquidation row', () => {
  const candidates = findReconciliationCandidates({
    investments: [{
      id: 'inv-1', date: '2026-03-08', amount: 500, description: 'Autosweep RFID', linkedExpenseProjectId: 'project_1',
    }],
    liquidations: [],
    projectExpenses: [{
      id: 'expense-1', date: '2026-03-08', amount: 500, description: 'Autosweep RFID', projectId: '1', sourceType: 'manual',
    }],
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].proposedAction, 'review_investment_expense_link');
  assert.equal(candidates[0].sourceIds.investmentId, 'inv-1');
  assert.equal(candidates[0].sourceIds.projectExpenseId, 'expense-1');
  assert.equal(candidates[0].autoApply, false);
});

test('presents expense-only matches with their legacy amount and expense evidence', () => {
  const investment = {
    id: 'inv-1', date: '2026-03-08', amount: 500, description: 'Autosweep RFID', investor: 'RJ Rivera',
  };
  const [candidate] = findReconciliationCandidates({
    investments: [investment],
    liquidations: [],
    projectExpenses: [{ id: 'expense-1', date: '2026-03-08', amount: 500, description: 'Autosweep RFID' }],
  });

  const presented = presentReconciliationCandidate(candidate, {
    investments: [investment], liquidations: [], index: 0,
  });

  assert.equal(presented.reviewAmountCentavos, 50000);
  assert.equal(presented.liquidationAmountCentavos, null);
  assert.equal(presented.legacyAmountCentavos, 50000);
  assert.deepEqual(presented.manualExpenseIds, ['expense-1']);
  assert.equal(presented.sourceLabel, 'Legacy expense match');
});

function validApproval(overrides = {}) {
  return {
    schemaVersion: 1,
    approvedActions: [{
      action: 'void_manual_expense_and_open_founder_advance',
      liquidationId: 'liq-1',
      liquidationRowIds: ['row-1'],
      canonicalExpenseIds: ['expense-canonical'],
      manualExpenseIds: ['expense-manual'],
      legacyInvestmentIds: ['inv-1'],
      founderId: 'user-6',
      amountCentavos: 580744,
      reviewedBy: 'superadmin-1',
      reviewedAt: '2026-07-15T00:00:00.000Z',
      reason: 'Duplicate of LQ-001 liquidation row',
      confirmedNotReimbursed: true,
      confirmedNotCapitalized: true,
      ...overrides,
    }],
  };
}

test('accepts only fully evidenced approved reconciliation actions', () => {
  const validated = validateApprovedActions(validApproval());
  assert.equal(validated.approvedActions.length, 1);
  assert.equal(validated.approvedActions[0].amountCentavos, 580744);
});

test('rejects an approval without explicit reimbursement and capitalization confirmations', () => {
  assert.throws(
    () => validateApprovedActions(validApproval({ confirmedNotReimbursed: false })),
    /confirmedNotReimbursed/,
  );
  assert.throws(
    () => validateApprovedActions(validApproval({ confirmedNotCapitalized: false })),
    /confirmedNotCapitalized/,
  );
});

test('rejects duplicate source ids and source ids reused across actions', () => {
  assert.throws(
    () => validateApprovedActions(validApproval({ manualExpenseIds: ['expense-1', 'expense-1'] })),
    /manualExpenseIds.*unique/,
  );

  const payload = validApproval();
  payload.approvedActions.push({
    ...payload.approvedActions[0],
    liquidationId: 'liq-2',
    liquidationRowIds: ['row-2'],
    canonicalExpenseIds: ['expense-canonical-2'],
    manualExpenseIds: ['expense-manual'],
    legacyInvestmentIds: ['inv-2'],
  });
  assert.throws(() => validateApprovedActions(payload), /manualExpenseIds.*more than one action/);
});

test('rejects weak audit evidence and unknown action fields', () => {
  assert.throws(
    () => validateApprovedActions(validApproval({ reviewedAt: 'July 15' })),
    /reviewedAt/,
  );
  assert.throws(
    () => validateApprovedActions(validApproval({ reason: 'duplicate' })),
    /reason/,
  );
  assert.throws(
    () => validateApprovedActions(validApproval({ unexpectedWrite: true })),
    /unexpectedWrite/,
  );
});

test('CLI defaults to dry-run and rejects disabled apply mode', () => {
  assert.deepEqual(parseCliArguments([]), { mode: 'dry-run', approvedActionsPath: null });
  assert.throws(
    () => parseCliArguments(['--apply', 'approved-actions.json']),
    /disabled.*review-only/i,
  );
  assert.throws(() => parseCliArguments(['--apply']), /disabled.*review-only/i);
  assert.throws(() => parseCliArguments(['--apply', 'approval.txt']), /disabled.*review-only/i);
});

test('dry-run builds candidates without calling the action applier', async () => {
  let applyCalls = 0;
  const report = await runReconciliation({
    argv: [],
    loadData: async () => ({ investments: [], liquidations: [], projectExpenses: [] }),
    loadApprovedActions: () => { throw new Error('must not load approvals during dry-run'); },
    applyActions: async () => { applyCalls += 1; },
  });

  assert.equal(report.mode, 'dry-run');
  assert.deepEqual(report.candidates, []);
  assert.equal(applyCalls, 0);
});

test('runReconciliation cannot enter apply mode', async () => {
  await assert.rejects(
    runReconciliation({
      argv: ['--apply', 'approved.json'],
      loadData: async () => ({ investments: [], liquidations: [], projectExpenses: [] }),
    }),
    /disabled.*review-only/i,
  );
});
