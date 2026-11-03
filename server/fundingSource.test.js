'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { treatmentOf, normalizeFundingSource, isEquityFunding, liquidationEquityError } = require('./fundingSource');

test('legacy records read their treatment from type', () => {
  assert.equal(treatmentOf({ type: 'investor_outofpocket', investor: 'RJ Rivera' }), 'equity_contribution');
  assert.equal(treatmentOf({ type: 'corporate_bank' }), 'company_funded');
  assert.equal(treatmentOf(null), null);
});

test('company payments keep paidVia and never carry an investor', () => {
  assert.deepEqual(normalizeFundingSource({ treatment: 'company_funded', paidVia: 'corporate_card', investor: 'RJ Rivera' }),
    { type: 'corporate_bank', treatment: 'company_funded', paidVia: 'corporate_card' });
  assert.deepEqual(normalizeFundingSource({ type: 'corporate_bank', paidVia: 'gcash' }), { type: 'corporate_bank', treatment: 'company_funded' });
});

test('capital keeps investor and linked row, and type stays in step', () => {
  assert.deepEqual(normalizeFundingSource({ treatment: 'equity_contribution', investor: ' RJ Rivera ', linkedInvestmentId: 'inv1' }),
    { type: 'investor_outofpocket', treatment: 'equity_contribution', investor: 'RJ Rivera', linkedInvestmentId: 'inv1' });
  assert.deepEqual(normalizeFundingSource({ type: 'investor_outofpocket', investor: 'TJ Caballero' }),
    { type: 'investor_outofpocket', treatment: 'equity_contribution', investor: 'TJ Caballero' });
});

test('an unknown treatment such as reimbursable falls back to type', () => {
  assert.equal(normalizeFundingSource({ treatment: 'reimbursable', type: 'corporate_bank' }).treatment, 'company_funded');
});

test('only capital with a named investor syncs to investments', () => {
  assert.equal(isEquityFunding({ treatment: 'equity_contribution', investor: 'RJ Rivera' }), true);
  assert.equal(isEquityFunding({ type: 'investor_outofpocket', investor: '' }), false);
  assert.equal(isEquityFunding({ treatment: 'company_funded', type: 'corporate_bank' }), false);
});

test('a liquidation row cannot newly become capital, but keeps an existing flag', () => {
  const equity = { treatment: 'equity_contribution', investor: 'TJ Caballero' };
  assert.match(liquidationEquityError({ sourceType: 'liquidation_sync' }, equity), /liquidation/);
  assert.equal(liquidationEquityError({ sourceType: 'liquidation_sync', fundingSource: { type: 'investor_outofpocket', investor: 'TJ Caballero' } }, equity), null);
  assert.equal(liquidationEquityError({ sourceType: 'manual' }, equity), null);
  assert.equal(liquidationEquityError({ sourceType: 'liquidation_sync' }, { treatment: 'company_funded' }), null);
});
