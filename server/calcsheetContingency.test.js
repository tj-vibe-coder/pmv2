const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateSuggestion } = require('./calcsheetContingency');

const observation = (id, date, cost, extra = {}) => ({
  observationId: id,
  productKey: 's203-c20',
  matchType: 'exact',
  quotationDate: date,
  normalizedUnitCost: cost,
  uom: 'pc',
  ...extra,
});

test('uses median quarterly growth and compounds source date to purchase date', () => {
  const observations = [
    observation('q1:a', '2025-04-01', 10000),
    observation('q2:a', '2025-07-01', 10200),
    observation('q3:a', '2025-10-01', 10404),
    observation('q4:a', '2026-01-01', 10612.08),
  ];
  const result = calculateSuggestion({
    observations,
    selectedObservationId: 'q1:a',
    analysisDate: '2026-01-15',
    expectedPurchaseDate: '2026-10-01',
  });
  assert.equal(result.method, 'quarterly');
  assert.equal(result.suggestedContingencyPct, 13);
  assert.equal(result.confidence, 'high');
});

test('falls back to annualized CAGR for two prices spanning at least nine months', () => {
  const result = calculateSuggestion({
    observations: [
      observation('q1:a', '2024-01-01', 10000),
      observation('q2:a', '2025-01-01', 11000),
    ],
    selectedObservationId: 'q2:a',
    analysisDate: '2025-02-01',
    expectedPurchaseDate: '2026-01-01',
  });
  assert.equal(result.method, 'annualized');
  assert.equal(result.suggestedContingencyPct, 10);
  assert.equal(result.confidence, 'low');
});

test('returns insufficient history instead of inventing a rate', () => {
  const result = calculateSuggestion({
    observations: [observation('q1:a', '2025-01-01', 10000)],
    selectedObservationId: 'q1:a',
    analysisDate: '2025-02-01',
    expectedPurchaseDate: '2025-05-01',
  });
  assert.equal(result.status, 'insufficient_history');
  assert.equal(result.suggestedContingencyPct, null);
});

test('clamps a decreasing trend to zero and rounds increases upward to 0.5%', () => {
  const falling = calculateSuggestion({
    observations: [
      observation('q1:a', '2024-01-01', 11000),
      observation('q2:a', '2025-01-01', 10000),
    ],
    selectedObservationId: 'q2:a',
    analysisDate: '2025-02-01',
    expectedPurchaseDate: '2026-02-01',
  });
  assert.equal(falling.suggestedContingencyPct, 0);
});

test('rounds a positive forecast upward to the next half percent', () => {
  const result = calculateSuggestion({
    observations: [
      observation('q1:a', '2024-01-01', 10000),
      observation('q2:a', '2025-01-01', 10620),
    ],
    selectedObservationId: 'q2:a',
    analysisDate: '2025-02-01',
    expectedPurchaseDate: '2026-01-01',
  });
  assert.equal(result.suggestedContingencyPct % 0.5, 0);
  assert.ok(result.suggestedContingencyPct >= 6.2);
});

test('uses only explicitly confirmed candidates when the selected row has no part number', () => {
  const candidateIdentity = { productKey: null, brand: 'ABB', description: 'S203 breaker' };
  const selected = observation('selected', '2024-01-01', 10000, candidateIdentity);
  const confirmed = observation('confirmed', '2025-01-01', 11000, candidateIdentity);
  const unconfirmed = observation('unconfirmed', '2025-01-01', 15000, candidateIdentity);
  const result = calculateSuggestion({
    observations: [selected, confirmed, unconfirmed],
    selectedObservationId: 'selected',
    confirmedCandidateObservationIds: ['confirmed'],
    analysisDate: '2025-02-01',
    expectedPurchaseDate: '2026-01-01',
  });
  assert.deepEqual(result.included.map((row) => row.observationId), ['selected', 'confirmed']);
  assert.equal(result.confidence, 'low');
});

test('uses only genuine normalized candidate matches from confirmed IDs', () => {
  const selected = observation('selected', '2024-01-01', 10000, {
    productKey: null,
    brand: 'ABB',
    description: '  S203   breaker ',
  });
  const genuineCandidate = observation('genuine', '2025-01-01', 11000, {
    productKey: null,
    brand: 'abb',
    description: 's203 breaker',
  });
  const unrelated = observation('unrelated', '2025-01-01', 50000, {
    productKey: null,
    brand: 'Different',
    description: 'Unrelated product',
  });

  const result = calculateSuggestion({
    observations: [selected, genuineCandidate, unrelated],
    selectedObservationId: 'selected',
    confirmedCandidateObservationIds: ['genuine', 'unrelated'],
    analysisDate: '2025-02-01',
    expectedPurchaseDate: '2026-01-01',
  });

  assert.deepEqual(result.included.map((row) => row.observationId), ['selected', 'genuine']);
  assert.ok(result.excluded.some((entry) =>
    entry.observationId === 'unrelated' && entry.reason === 'invalid_confirmed_candidate'));
});

test('rejects confirmed candidates when the shared identity is blank', () => {
  const selected = observation('selected', '2024-01-01', 10000, {
    productKey: null,
    brand: '',
    description: '',
  });
  const blankCandidate = observation('blank-candidate', '2025-01-01', 11000, {
    productKey: null,
    brand: '',
    description: '',
  });

  const result = calculateSuggestion({
    observations: [selected, blankCandidate],
    selectedObservationId: 'selected',
    confirmedCandidateObservationIds: ['blank-candidate'],
    analysisDate: '2025-02-01',
    expectedPurchaseDate: '2026-01-01',
  });

  assert.deepEqual(result.included.map((row) => row.observationId), ['selected']);
  assert.ok(result.excluded.some((entry) =>
    entry.observationId === 'blank-candidate' && entry.reason === 'invalid_confirmed_candidate'));
});

test('does not use confirmed candidates when the selected row has an exact product key', () => {
  const exactSelected = observation('selected', '2024-01-01', 10000, {
    brand: 'ABB',
    description: 'S203 breaker',
  });
  const exactMatch = observation('exact-match', '2025-01-01', 11000, {
    brand: 'ABB',
    description: 'S203 breaker',
  });
  const injectedCandidate = observation('injected', '2025-01-01', 50000, {
    productKey: null,
    brand: 'Different',
    description: 'Unrelated product',
  });

  const result = calculateSuggestion({
    observations: [exactSelected, exactMatch, injectedCandidate],
    selectedObservationId: 'selected',
    confirmedCandidateObservationIds: ['injected'],
    analysisDate: '2025-02-01',
    expectedPurchaseDate: '2026-01-01',
  });

  assert.deepEqual(result.included.map((row) => row.observationId), ['selected', 'exact-match']);
  assert.ok(result.excluded.some((entry) =>
    entry.observationId === 'injected' && entry.reason === 'invalid_confirmed_candidate'));
});

test('flags a robust log-trend outlier and excludes it visibly', () => {
  const result = calculateSuggestion({
    observations: [
      observation('q1', '2024-01-01', 100),
      observation('q2', '2024-04-01', 102),
      observation('q3', '2024-07-01', 104),
      observation('q4', '2024-10-01', 106),
      observation('typo', '2025-01-01', 10000),
      observation('q6', '2025-01-02', 108),
    ],
    selectedObservationId: 'q6',
    analysisDate: '2025-02-01',
    expectedPurchaseDate: '2025-05-01',
  });
  assert.ok(result.excluded.some((entry) =>
    entry.observationId === 'typo' && entry.reason === 'statistical_outlier'));
});

test('excludes invalid dates, non-positive prices, future observations, and incompatible UOM', () => {
  const result = calculateSuggestion({
    observations: [
      observation('selected', '2024-01-01', 10000),
      observation('valid', '2025-01-01', 11000),
      observation('future', '2027-01-01', 15000),
      observation('bad-price', '2025-01-01', null),
      observation('wrong-uom', '2025-01-01', 12000, { uom: 'box' }),
    ],
    selectedObservationId: 'selected',
    analysisDate: '2025-02-01',
    expectedPurchaseDate: '2026-02-01',
  });
  assert.deepEqual(result.excluded.map((entry) => entry.observationId).sort(),
    ['bad-price', 'future', 'wrong-uom']);
});

test('classifies an impossible calendar date as invalid evidence', () => {
  const result = calculateSuggestion({
    observations: [
      observation('selected', '2024-01-01', 10000),
      observation('valid', '2025-01-01', 11000),
      observation('bad-date', '2025-02-30', 12000),
    ],
    selectedObservationId: 'selected',
    analysisDate: '2025-03-15',
    expectedPurchaseDate: '2026-03-15',
  });

  assert.ok(result.excluded.some((entry) =>
    entry.observationId === 'bad-date' && entry.reason === 'invalid_date'));
});

test('lowers otherwise-medium confidence when evidence has a data-quality warning', () => {
  const result = calculateSuggestion({
    observations: [
      observation('q2', '2024-04-01', 10000),
      observation('q3', '2024-07-01', 10200),
      observation('q4', '2024-10-01', 10404),
      observation('invalid', '2024-11-01', 0),
    ],
    selectedObservationId: 'q4',
    analysisDate: '2025-02-01',
    expectedPurchaseDate: '2025-10-01',
  });

  assert.equal(result.method, 'quarterly');
  assert.equal(result.confidence, 'low');
});

test('does not suggest a contingency from a selected future observation', () => {
  const result = calculateSuggestion({
    observations: [
      observation('old', '2024-01-01', 10000),
      observation('current', '2025-01-01', 11000),
      observation('selected', '2025-06-01', 12000),
    ],
    selectedObservationId: 'selected',
    analysisDate: '2025-02-01',
    expectedPurchaseDate: '2026-02-01',
  });

  assert.equal(result.status, 'insufficient_history');
  assert.equal(result.suggestedContingencyPct, null);
  assert.ok(result.excluded.some((entry) =>
    entry.observationId === 'selected' && entry.reason === 'future_observation'));
});

test('excludes non-finite normalized costs from trend evidence', () => {
  const result = calculateSuggestion({
    observations: [
      observation('selected', '2024-01-01', 10000),
      observation('valid', '2025-01-01', 11000),
      observation('infinite', '2025-01-15', Infinity),
    ],
    selectedObservationId: 'selected',
    analysisDate: '2025-02-01',
    expectedPurchaseDate: '2026-02-01',
  });

  assert.equal(result.status, 'ready');
  assert.ok(Number.isFinite(result.rate));
  assert.ok(result.excluded.some((entry) =>
    entry.observationId === 'infinite' && entry.reason === 'invalid_cost'));
});

test('includes the same calendar date one year earlier in the quarterly window', () => {
  const result = calculateSuggestion({
    observations: [
      observation('q1', '2023-03-01', 10000),
      observation('q2', '2023-04-01', 10200),
      observation('q3', '2023-07-01', 10404),
    ],
    selectedObservationId: 'q3',
    analysisDate: '2024-03-01',
    expectedPurchaseDate: '2024-07-01',
  });

  assert.equal(result.method, 'quarterly');
});
