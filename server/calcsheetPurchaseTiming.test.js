const test = require('node:test');
const assert = require('node:assert/strict');
const { validateQuotationPurchaseTiming } = require('./calcsheetPurchaseTiming');

test('accepts valid quotation and component purchase dates on or after Date Sent', () => {
  assert.equal(validateQuotationPurchaseTiming({
    dateSent: '2026-01-15',
    expectedPurchaseDate: '2026-01-15',
    components: [{ expectedPurchaseDate: '2026-02-01' }],
  }), null);
});

test('rejects impossible quotation and component purchase calendar dates', () => {
  assert.match(validateQuotationPurchaseTiming({
    dateSent: '2026-01-15',
    expectedPurchaseDate: '2026-02-30',
  }), /valid calendar date/i);
  assert.match(validateQuotationPurchaseTiming({
    dateSent: '2026-01-15',
    components: [{ expectedPurchaseDate: '2026-04-31' }],
  }), /component 1.*valid calendar date/i);
});

test('rejects purchase dates before the effective quotation date', () => {
  assert.match(validateQuotationPurchaseTiming({
    dateSent: '2026-03-01',
    expectedPurchaseDate: '2026-02-28',
    components: [{ expectedPurchaseDate: '2026-03-01' }],
  }), /quotation date/i);
  assert.match(validateQuotationPurchaseTiming({
    dateSent: '2026-03-01',
    components: [{ expectedPurchaseDate: '2026-02-28' }],
  }), /component 1.*quotation date/i);
});
