const test = require('node:test');
const assert = require('node:assert/strict');

const {
  phpToCentavos,
  remainingCentavos,
  validateSettlement,
  isRecognizedFounder,
  validateSource,
  validateCapitalization,
  newAuditFields,
  classifyNoCaLiquidation,
  summarizeFounderLedger,
  liquidationSourceKey,
  buildLedgerEntry,
  buildLiquidationExpenseDocs,
  sumLiquidationRowsCentavos,
  validateLiquidationRows,
} = require('./founderFunding');

test('phpToCentavos retains exact centavos', () => {
  assert.equal(phpToCentavos('5807.44'), 580744);
  assert.equal(phpToCentavos(3781), 378100);
  assert.equal(phpToCentavos('0.01'), 1);
});

test('phpToCentavos rejects invalid, non-positive, and over-precise values', () => {
  for (const value of ['', 'not money', 0, -1, '10.001', null, undefined]) {
    assert.throws(() => phpToCentavos(value), /amount/i);
  }
});

test('remainingCentavos subtracts all posted settlement amounts', () => {
  assert.equal(remainingCentavos(580744, [200000, 180000]), 200744);
  assert.equal(remainingCentavos(580744, []), 580744);
});

test('remainingCentavos rejects malformed amounts and over-settlement', () => {
  assert.throws(() => remainingCentavos(100, [101]), /exceed/i);
  assert.throws(() => remainingCentavos(100.5, []), /centavo/i);
  assert.throws(() => remainingCentavos(100, [-1]), /centavo/i);
});

test('settlement cannot exceed a founder advance', () => {
  assert.doesNotThrow(() => validateSettlement({ outstandingCentavos: 200744, amountCentavos: 200744 }));
  assert.throws(
    () => validateSettlement({ outstandingCentavos: 200744, amountCentavos: 200745 }),
    /exceeds/,
  );
});

test('settlement must use positive integer centavos against a positive balance', () => {
  assert.throws(() => validateSettlement({ outstandingCentavos: 100, amountCentavos: 0 }), /positive centavo/);
  assert.throws(() => validateSettlement({ outstandingCentavos: 100, amountCentavos: 1.5 }), /positive centavo/);
  assert.throws(() => validateSettlement({ outstandingCentavos: 0, amountCentavos: 1 }), /outstanding/);
});

test('only configured founder ids are recognized', () => {
  assert.equal(isRecognizedFounder('user_tjc', ['user_tjc', 'user_rjr']), true);
  assert.equal(isRecognizedFounder('user_employee', ['user_tjc', 'user_rjr']), false);
  assert.equal(isRecognizedFounder('', ['user_tjc']), false);
  assert.equal(isRecognizedFounder('user_tjc', null), false);
});

test('liquidation sources require a liquidation id', () => {
  assert.throws(() => validateSource({ kind: 'liquidation' }), /liquidationId/);
  assert.doesNotThrow(() => validateSource({ kind: 'liquidation', liquidationId: 'liq_4' }));
});

test('cash deposit references are optional evidence', () => {
  assert.doesNotThrow(() => validateSource({ kind: 'cash_deposit' }));
  assert.doesNotThrow(() => validateSource({ kind: 'cash_deposit', depositReference: 'BDO-123' }));
});

test('legacy reconciliation is a valid source while unrelated source kinds are rejected', () => {
  assert.doesNotThrow(() => validateSource({ kind: 'legacy_reconciliation' }));
  assert.doesNotThrow(() => validateSource({ kind: 'legacy_reconciliation', reconciliationId: 'recon_1' }));
  assert.throws(() => validateSource({ kind: 'expense', expenseId: 'expense_1' }), /invalid funding source/i);
});

test('liquidation source keys enforce one funding entry per liquidation', () => {
  assert.equal(liquidationSourceKey('liq_4'), 'liquidation:liq_4');
  assert.equal(liquidationSourceKey('liq_4', 'row_2'), 'liquidation:liq_4');
  assert.equal(liquidationSourceKey(' liq_4 ', ' row_2 '), 'liquidation:liq_4');
  assert.throws(() => liquidationSourceKey(''), /liquidationId/);
});

test('capitalization requires an explicit resolution reference', () => {
  assert.throws(() => validateCapitalization({ resolutionReference: '' }), /resolution/);
  assert.throws(() => validateCapitalization({ resolutionReference: '   ' }), /resolution/);
  assert.doesNotThrow(() => validateCapitalization({ resolutionReference: 'BR-2026-07-01' }));
});

test('new audit fields create a posted immutable-entry baseline', () => {
  assert.deepEqual(newAuditFields('user_tjc', '2026-07-15T00:00:00.000Z'), {
    createdAt: '2026-07-15T00:00:00.000Z',
    createdBy: 'user_tjc',
    status: 'posted',
  });
  assert.throws(() => newAuditFields('', '2026-07-15T00:00:00.000Z'), /user/i);
});

test('buildLedgerEntry creates a normalized append-only ledger document', () => {
  assert.deepEqual(buildLedgerEntry({
    transactionDate: '2026-07-15',
    founderId: 'user_tjc',
    founderName: ' TJ Caballero ',
    entryType: 'founder_advance',
    amount: '5807.44',
    description: ' Cebu Pacific Flight ',
    source: { kind: 'liquidation', liquidationId: 'liq_4', liquidationFormNo: 'LQ-001' },
    proofRefs: [' receipt-1 ', ''],
    userId: 'user_tjc',
    now: '2026-07-15T00:00:00.000Z',
  }), {
    transactionDate: '2026-07-15',
    founderId: 'user_tjc',
    founderName: 'TJ Caballero',
    entryType: 'founder_advance',
    amountCentavos: 580744,
    currency: 'PHP',
    description: 'Cebu Pacific Flight',
    source: { kind: 'liquidation', liquidationId: 'liq_4', liquidationFormNo: 'LQ-001' },
    proofRefs: ['receipt-1'],
    createdAt: '2026-07-15T00:00:00.000Z',
    createdBy: 'user_tjc',
    status: 'posted',
    settledCentavos: 0,
  });
});

test('buildLedgerEntry omits undefined optional source fields for Firestore compatibility', () => {
  const entry = buildLedgerEntry({
    transactionDate: '2026-07-15', founderId: 'user_tjc', founderName: 'TJ',
    entryType: 'founder_advance', amountCentavos: 100, description: 'Deposit',
    source: { kind: 'cash_deposit', depositReference: undefined },
    userId: 'user_tjc', now: '2026-07-15T00:00:00.000Z',
  });
  assert.deepEqual(entry.source, { kind: 'cash_deposit' });
});

test('buildLedgerEntry validates entry type, founder identity, date, and settlement link', () => {
  const baseline = {
    transactionDate: '2026-07-15', founderId: 'user_tjc', founderName: 'TJ', amount: 1,
    description: 'Funding', source: { kind: 'cash_deposit', depositReference: 'BDO-1' },
    userId: 'user_tjc', now: '2026-07-15T00:00:00.000Z',
  };
  assert.throws(() => buildLedgerEntry({ ...baseline, entryType: 'expense' }), /entry type/i);
  assert.throws(() => buildLedgerEntry({ ...baseline, entryType: 'founder_advance', founderId: '' }), /founder/i);
  assert.throws(() => buildLedgerEntry({ ...baseline, entryType: 'founder_advance', transactionDate: '07/15/2026' }), /date/i);
  assert.throws(() => buildLedgerEntry({ ...baseline, entryType: 'repayment' }), /settlesEntryId/);
});

test('buildLedgerEntry requires capitalization approval evidence', () => {
  const baseline = {
    transactionDate: '2026-07-15', founderId: 'user_tjc', founderName: 'TJ',
    entryType: 'capitalization', amountCentavos: 100, description: 'Convert advance',
    source: { kind: 'legacy_reconciliation', reconciliationId: 'recon_1' },
    settlesEntryId: 'advance_1', userId: 'user_tjc', now: '2026-07-15T00:00:00.000Z',
  };
  assert.throws(() => buildLedgerEntry(baseline), /resolution/);
  const entry = buildLedgerEntry({ ...baseline, resolutionReference: 'BR-2026-07-01', approvedBy: 'user_tjc' });
  assert.equal(entry.resolutionReference, 'BR-2026-07-01');
  assert.equal(entry.approvedBy, 'user_tjc');
  assert.equal(entry.approvedAt, '2026-07-15T00:00:00.000Z');
});

test('direct capital contributions retain their approval reference and whitelist source fields', () => {
  const entry = buildLedgerEntry({
    entryType: 'capital_contribution', founderId: 'tjc', founderName: 'TJ',
    transactionDate: '2026-07-15', amount: '100.00', description: 'Permanent capital',
    source: { kind: 'cash_deposit', depositReference: 'BDO-1', unexpected: 'drop me' },
    resolutionReference: 'BR-2026-01', userId: 'tjc', now: '2026-07-15T00:00:00.000Z',
  });
  assert.equal(entry.resolutionReference, 'BR-2026-01');
  assert.equal(entry.source.unexpected, undefined);
});

test('founder no-CA liquidation creates a founder advance by default', () => {
  assert.equal(
    classifyNoCaLiquidation({ isFounder: true, treatment: 'company_owes_founder' }),
    'founder_advance',
  );
  assert.equal(classifyNoCaLiquidation({ isFounder: true, treatment: null }), 'founder_advance');
});

test('explicit founder capital treatment requires capitalization evidence', () => {
  assert.equal(
    classifyNoCaLiquidation({
      isFounder: true,
      treatment: 'capital_contribution',
      capitalizationReference: 'BR-2026-07-01',
    }),
    'capital_contribution',
  );
  assert.throws(
    () => classifyNoCaLiquidation({ isFounder: true, treatment: 'capital_contribution' }),
    /resolution/,
  );
});

test('non-founder no-CA liquidation remains a reimbursement', () => {
  assert.equal(classifyNoCaLiquidation({ isFounder: false, treatment: null }), 'reimbursement');
  assert.equal(
    classifyNoCaLiquidation({ isFounder: false, treatment: 'capital_contribution' }),
    'reimbursement',
  );
});

test('ledger summary uses only posted entries and calculates per-founder balances', () => {
  const entries = [
    { id: 'a1', founderId: 'tjc', entryType: 'founder_advance', amountCentavos: 580744, status: 'posted' },
    { id: 'a2', founderId: 'rjr', entryType: 'opening_balance_adjustment', amountCentavos: 100000, status: 'posted' },
    { id: 'c1', founderId: 'tjc', entryType: 'capital_contribution', amountCentavos: 200000, status: 'posted' },
    { id: 'r1', founderId: 'tjc', entryType: 'repayment', settlesEntryId: 'a1', amountCentavos: 180000, status: 'posted', transactionDate: '2026-07-05' },
    { id: 'x1', founderId: 'tjc', entryType: 'capitalization', settlesEntryId: 'a1', amountCentavos: 200000, status: 'posted' },
    { id: 'voided', founderId: 'tjc', entryType: 'founder_advance', amountCentavos: 999999, status: 'voided' },
  ];

  assert.deepEqual(summarizeFounderLedger(entries, { periodStart: '2026-07-01', periodEnd: '2026-07-31' }), {
    advancesOutstandingCentavos: 300744,
    capitalContributedCentavos: 400000,
    repaidThisPeriodCentavos: 180000,
    perFounder: {
      tjc: {
        advancesOutstandingCentavos: 200744,
        capitalContributedCentavos: 400000,
        repaidThisPeriodCentavos: 180000,
      },
      rjr: {
        advancesOutstandingCentavos: 100000,
        capitalContributedCentavos: 0,
        repaidThisPeriodCentavos: 0,
      },
    },
  });
});

test('ledger summary excludes repayments outside the requested period from the period KPI', () => {
  const entries = [
    { id: 'a1', founderId: 'tjc', entryType: 'founder_advance', amountCentavos: 50000, status: 'posted' },
    { id: 'r1', founderId: 'tjc', entryType: 'repayment', settlesEntryId: 'a1', amountCentavos: 10000, status: 'posted', transactionDate: '2026-06-30' },
  ];
  const summary = summarizeFounderLedger(entries, { periodStart: '2026-07-01', periodEnd: '2026-07-31' });
  assert.equal(summary.advancesOutstandingCentavos, 40000);
  assert.equal(summary.repaidThisPeriodCentavos, 0);
  assert.equal(summary.perFounder.tjc.repaidThisPeriodCentavos, 0);
});

test('ledger summary rejects orphaned or excessive settlements', () => {
  assert.throws(
    () => summarizeFounderLedger([
      { id: 'r1', founderId: 'tjc', entryType: 'repayment', settlesEntryId: 'missing', amountCentavos: 1, status: 'posted' },
    ]),
    /unknown advance/i,
  );
  assert.throws(
    () => summarizeFounderLedger([
      { id: 'a1', founderId: 'tjc', entryType: 'founder_advance', amountCentavos: 100, status: 'posted' },
      { id: 'r1', founderId: 'tjc', entryType: 'repayment', settlesEntryId: 'a1', amountCentavos: 101, status: 'posted' },
    ]),
    /exceed/i,
  );
});

test('ledger summary rejects unsafe aggregate centavo totals', () => {
  assert.throws(
    () => summarizeFounderLedger([
      { id: 'c1', founderId: 'tjc', entryType: 'capital_contribution', amountCentavos: Number.MAX_SAFE_INTEGER, status: 'posted' },
      { id: 'c2', founderId: 'tjc', entryType: 'capital_contribution', amountCentavos: 1, status: 'posted' },
    ]),
    /safe integer|aggregate/i,
  );
});

test('liquidation expense documents are deterministic and preserve exact receipt amounts', () => {
  const input = {
    liquidationId: 'liq_4', formNo: 'LQ-001', userId: 'user_6',
    createdAt: '2026-07-15T00:00:00.000Z',
    rows: [
      { id: 'row-flight', projectId: 5, projectName: 'Lear MES', particulars: 'Cebu Pacific Flight', amount: 5807.44, date: '2026-02-10', category: 'Transportation' },
      { id: 'row-no-project', amount: 10 },
    ],
  };
  const docs = buildLiquidationExpenseDocs(input);
  assert.equal(docs.length, 1);
  assert.match(docs[0].id, /^liquidation_/);
  assert.deepEqual(docs[0].data, {
    projectId: '5', projectName: 'Lear MES', description: 'Liquidation LQ-001: Cebu Pacific Flight',
    amount: 5807.44, date: '2026-02-10', category: 'Transportation',
    createdAt: '2026-07-15T00:00:00.000Z', createdBy: 'user_6', sourceType: 'liquidation_sync',
    sourceLiquidationId: 'liq_4', sourceLiquidationRowId: 'row-flight',
  });
  const repeat = buildLiquidationExpenseDocs({ ...input, rows: [{ id: 'row-flight', projectId: 5, amount: 1 }] });
  assert.equal(repeat[0].id, docs[0].id);
});

test('liquidation expense documents reject invalid monetary precision', () => {
  const base = { liquidationId: 'liq_4', formNo: 'LQ-001', userId: 'user_6', createdAt: '2026-07-15T00:00:00.000Z' };
  assert.throws(() => buildLiquidationExpenseDocs({ ...base, rows: [{ id: 'bad', projectId: 5, amount: '1.001' }] }), /amount/i);
  assert.throws(() => buildLiquidationExpenseDocs({ ...base, rows: [{ id: 'bad', projectId: 5, amount: Infinity }] }), /amount/i);
});

test('liquidation row totals use exact centavos and reject unsafe values', () => {
  assert.equal(sumLiquidationRowsCentavos([{ amount: '5807.44' }, { amount: 0 }, { amount: '0.56' }]), 580800);
  assert.throws(() => sumLiquidationRowsCentavos([{ amount: '1.001' }]), /amount/i);
  assert.throws(() => sumLiquidationRowsCentavos([{ amount: -1 }]), /amount/i);
});

test('submitted liquidation rows require unique stable ids', () => {
  assert.doesNotThrow(() => validateLiquidationRows([{ id: 'a', amount: 1 }, { id: 'b', amount: 2 }]));
  assert.throws(() => validateLiquidationRows([{ id: 'same', amount: 1 }, { id: 'same', amount: 2 }]), /unique/i);
  assert.throws(() => validateLiquidationRows([{ id: '', amount: 1 }]), /stable id/i);
  assert.throws(() => validateLiquidationRows(new Array(451).fill({ id: 'x', amount: 1 })), /450/);
});

test('ledger text and evidence fields are bounded', () => {
  const base = {
    transactionDate: '2026-07-15', founderId: 'tjc', founderName: 'TJ', entryType: 'founder_advance',
    amountCentavos: 100, description: 'Funding', source: { kind: 'cash_deposit' },
    userId: 'tjc', now: '2026-07-15T00:00:00.000Z',
  };
  assert.throws(() => buildLedgerEntry({ ...base, description: 'x'.repeat(1001) }), /description/i);
  assert.throws(() => buildLedgerEntry({ ...base, proofRefs: new Array(21).fill('proof') }), /proof/i);
  assert.throws(() => buildLedgerEntry({ ...base, proofRefs: ['x'.repeat(2001)] }), /proof/i);
});
