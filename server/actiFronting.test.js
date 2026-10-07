const test = require('node:test');
const assert = require('node:assert/strict');
const { isActiClient, resolveActiFronting } = require('./actiFronting');

const ACTI = { id: 'jrjzttvKT1lhQaPRnzOy', name: 'Advance Controle Technologie Inc' };

test('isActiClient matches ACTI by full or short name only', () => {
  assert.equal(isActiClient(ACTI), true);
  assert.equal(isActiClient({ name: 'ACTI' }), true);
  assert.equal(isActiClient({ name: 'Analog Devices Inc' }), false);
  assert.equal(isActiClient({ name: 'Practical Industries' }), false);
  assert.equal(isActiClient(null), false);
  assert.equal(isActiClient({}), false);
});

test('ACTI customer with no partner link and an IOCT-only quotation is ACTI-fronted (IOCT2610001 case)', () => {
  const out = resolveActiFronting({
    project: { partnerId: null },
    client: ACTI,
    partner: null,
    quotations: [{ kind: 'IOCT' }],
  });
  assert.equal(out.withActi, true);
  assert.deepEqual(out.partner, { id: ACTI.id, name: ACTI.name });
});

test('non-ACTI customer with no partner and no ACTI quotation stays direct', () => {
  const out = resolveActiFronting({
    project: { partnerId: null },
    client: { id: 'c1', name: 'Analog Devices Inc' },
    partner: null,
    quotations: [{ kind: 'IOCT' }],
  });
  assert.equal(out.withActi, false);
  assert.equal(out.partner, null);
});

test('existing partner link is unchanged, even when the customer is also ACTI', () => {
  const partner = { id: 'p1', name: 'Some Partner' };
  const out = resolveActiFronting({
    project: { partnerId: 'p1' },
    client: ACTI,
    partner,
    quotations: [{ kind: 'IOCT' }],
  });
  assert.equal(out.withActi, true);
  assert.equal(out.partner, partner);
});

test('ACTI-kind quotation still flags ACTI without touching the partner', () => {
  const out = resolveActiFronting({
    project: { partnerId: null },
    client: { id: 'c1', name: 'Analog Devices Inc' },
    partner: null,
    quotations: [{ kind: 'IOCT' }, { kind: 'ACTI' }],
  });
  assert.equal(out.withActi, true);
  assert.equal(out.partner, null);
});
