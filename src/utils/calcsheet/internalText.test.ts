import { findInternalLookingText } from './internalText';
import type { ComponentLine, GeneralReqLine, ServiceLine } from '../../types/Quotation';

const comp = (p: Partial<ComponentLine>): ComponentLine => ({
  id: 'c', code: 'B1', description: 'Cable', qty: 1, uom: 'm', unitCost: 1, forex: 1, contingencyPct: 0, discountPct: 0, ...p,
});
const svc = (p: Partial<ServiceLine>): ServiceLine => ({ id: 's', code: 'C1', description: 'Programming', amount: 1, ...p });
const gen = (p: Partial<GeneralReqLine>): GeneralReqLine => ({ id: 'g', code: 'A1', description: 'Mobilization', unitPrice: 1, qty: 1, uom: 'lot', ...p });
const q = (o: { generalReqts?: GeneralReqLine[]; components?: ComponentLine[]; services?: ServiceLine[] }) =>
  ({ generalReqts: [], components: [], services: [], ...o });

it('finds nothing in ordinary printed text', () => {
  expect(findInternalLookingText(q({
    generalReqts: [gen({})], components: [comp({ description: 'Power cable 3C x 2.5 mm2, 600V', brand: 'Phelps Dodge', partNo: 'PD-325' })], services: [svc({})],
  }))).toEqual([]);
});

it('flags the bracket tags and wording an agent put in a description', () => {
  const found = findInternalLookingText(q({
    components: [
      comp({ id: 'a', code: 'B3', description: 'Circuit breaker 3P 100A (budgetary – for supplier quote) [Not in pricelist]' }),
      comp({ id: 'b', code: 'B4', description: 'Contactor 25A [Pricelist: IOCT Electrical Materials 2026]' }),
    ],
  }));
  expect(found).toHaveLength(2);
  expect(found[0]).toMatchObject({ section: 'Components', code: 'B3', field: 'description' });
  expect(found[0].matches).toEqual(expect.arrayContaining(['[Not in pricelist]', 'budgetary', 'for supplier quote']));
  expect(found[1].matches).toEqual(expect.arrayContaining(['[Pricelist: IOCT Electrical Materials 2026]', 'Pricelist']));
});

it('is case-insensitive and accepts "price list" with a space', () => {
  const found = findInternalLookingText(q({ components: [comp({ description: 'Relay BUDGETARY, from the Price List' })] }));
  expect(found[0].matches.map((m) => m.toLowerCase())).toEqual(expect.arrayContaining(['budgetary', 'price list']));
});

it('checks every printed field in every section, but never the internal note', () => {
  const found = findInternalLookingText(q({
    generalReqts: [gen({ description: 'Permits [TBC]' })],
    components: [
      comp({ subheader: 'Supplier quote items', brand: 'ABB [budgetary]', group: 'Pricelist group' }),
      comp({ id: 'n', description: 'Clean description', internalNote: 'budgetary – for supplier quote [Not in pricelist]' }),
    ],
    services: [svc({ description: 'Programming (budgetary)', subheader: 'Services [draft]' })],
  }));
  expect(found.map((f) => `${f.section}:${f.field}`)).toEqual([
    'General Requirements:description',
    'Components:subheader',
    'Components:brand',
    'Components:group',
    'Services:description',
    'Services:subheader',
  ]);
});

it('ignores blank and missing fields, and lists each match once', () => {
  expect(findInternalLookingText(q({ components: [comp({ description: '   ', brand: undefined })] }))).toEqual([]);
  const [one] = findInternalLookingText(q({ components: [comp({ description: 'Budgetary item, budgetary price [x] [x]' })] }));
  expect(one.matches.filter((m) => m.toLowerCase() === 'budgetary')).toHaveLength(1);
});
