import type { Project as CalcsheetProject, Quotation, QuotationTotals } from '../types/Quotation';
import { ioctCostBasis, ioctMargin } from './calcsheet/calc';
import { matchCalcsheetProject, resolveCalcsheetBudget, resolveCalcsheetPrice } from './calcsheetBudget';

const totals = (over: Partial<QuotationTotals>): QuotationTotals => ({
  generalReqtsCost: 0,
  generalReqtsWithContingency: 0,
  generalReqtsSubtotal: 0,
  componentsCost: 0,
  componentsSubtotal: 0,
  laborCost: 0,
  laborWithContingency: 0,
  servicesSubtotal: 0,
  subtotal: 0,
  discount: 0,
  vat: 0,
  grandTotal: 0,
  ...over,
});

const q = (over: Partial<Quotation> & { legacyTotalsSnapshot: QuotationTotals }): Quotation =>
  ({
    id: 'q1',
    projectId: 'cs1',
    kind: 'IOCT',
    revision: '00',
    formulaVersion: 'legacy',
    recipientId: null,
    validityDays: 30,
    paymentTerms: '',
    deliveryTerms: '',
    warrantyMonths: 12,
    productMarkupPct: 0,
    laborMarkupPct: 0,
    generalReqMarkupPct: 0,
    globalContingencyPct: 0,
    discountPct: 0,
    vatPct: 0,
    generalReqts: [],
    components: [],
    services: [],
    manpower: [],
    servicesFromManpower: false,
    createdAt: '',
    updatedAt: '',
    ...over,
  }) as Quotation;

test('ioctCostBasis is quotation value minus margin (the cost)', () => {
  const t = totals({
    generalReqtsCost: 10_000,
    componentsCost: 20_000,
    laborCost: 40_000,
    generalReqtsSubtotal: 15_000,
    componentsSubtotal: 30_000,
    servicesSubtotal: 55_000,
    subtotal: 100_000,
    discount: 0,
    vat: 12_000,
    grandTotal: 112_000,
  });
  const margin = ioctMargin(t);
  expect(margin?.value).toBe(30_000);
  expect(ioctCostBasis(t)).toBe(70_000);
  expect(ioctCostBasis(t)).toBe((t.subtotal - t.discount) - (margin?.value ?? 0));
});

test('ioctCostBasis falls back to VAT-ex net when margin is unknown', () => {
  const t = totals({
    generalReqtsCost: 100_000,
    componentsCost: 0,
    laborCost: 0,
    generalReqtsSubtotal: 100_000,
    componentsSubtotal: 0,
    servicesSubtotal: 0,
    subtotal: 100_000,
    discount: 0,
    vat: 12_000,
    grandTotal: 112_000,
  });
  expect(ioctMargin(t)).toBeNull();
  expect(ioctCostBasis(t)).toBe(100_000);
});

test('matchCalcsheetProject prefers mainProjectId then project number', () => {
  const csProjects: Pick<CalcsheetProject, 'id' | 'code' | 'mainProjectId' | 'mainProjectNo'>[] = [
    { id: 'cs-a', code: 'PCS2601001-ABC-00', mainProjectId: '5', mainProjectNo: 'IOCT2601001' },
    { id: 'cs-b', code: 'PCS2602002-XYZ-00' },
  ];
  expect(matchCalcsheetProject({ id: 5, project_no: 'IOCT2601001' }, csProjects)?.id).toBe('cs-a');
  expect(matchCalcsheetProject({ id: 9, project_no: 'PCS2602002-XYZ-00' }, csProjects)?.id).toBe('cs-b');
  expect(matchCalcsheetProject({ id: 9, calcsheet_code: 'PCS2602002-XYZ-00' }, csProjects)?.id).toBe('cs-b');
});

test('resolveCalcsheetBudget uses the latest IOCT revision cost basis', () => {
  const csProjects = [{ id: 'cs1', code: 'PCS2601001-ABC-00', mainProjectId: '5', mainProjectNo: 'IOCT2601001' }];
  const older = q({
    id: 'q-old',
    revision: '00',
    legacyTotalsSnapshot: totals({
      generalReqtsCost: 10_000, componentsCost: 10_000, laborCost: 10_000,
      generalReqtsSubtotal: 20_000, componentsSubtotal: 20_000, servicesSubtotal: 20_000,
      subtotal: 60_000, grandTotal: 60_000,
    }),
  });
  const newer = q({
    id: 'q-new',
    revision: '01',
    legacyTotalsSnapshot: totals({
      generalReqtsCost: 10_000, componentsCost: 20_000, laborCost: 40_000,
      generalReqtsSubtotal: 15_000, componentsSubtotal: 30_000, servicesSubtotal: 55_000,
      subtotal: 100_000, grandTotal: 100_000,
    }),
  });
  const resolved = resolveCalcsheetBudget(
    { id: 5, project_no: 'IOCT2601001' },
    csProjects,
    [older, newer],
  );
  expect(resolved?.quotationId).toBe('q-new');
  expect(resolved?.amount).toBe(70_000);
  expect(resolved?.hasMargin).toBe(true);
  expect(resolved?.value).toBe(100_000);
  expect(resolved?.margin).toBe(30_000);
});

describe('awarded proposals (price lock)', () => {
  const rev00 = q({ id: 'r0', revision: '00', legacyTotalsSnapshot: totals({ subtotal: 100000, grandTotal: 100000, componentsCost: 60000, componentsSubtotal: 100000 }) });
  const rev01 = q({ id: 'r1', revision: '01', legacyTotalsSnapshot: totals({ subtotal: 120000, grandTotal: 120000, componentsCost: 70000, componentsSubtotal: 120000 }) });
  const ops = { id: 'ops1' };
  const cs = { id: 'cs1', code: 'PCS2606041-BLI-00', mainProjectId: 'ops1' } as CalcsheetProject;

  test('unlocked: price is the latest IOCT revision', () => {
    const price = resolveCalcsheetPrice(ops, [cs], [rev00, rev01]);
    expect(price).toMatchObject({ price: 120000, source: 'latest', quotationId: 'r1', quotationLabel: 'IOCT rev 01', calcsheetCode: 'PCS2606041-BLI-00' });
    expect(resolveCalcsheetBudget(ops, [cs], [rev00, rev01])?.amount).toBe(70000);
  });

  test('awarded: price and budget come from the lock, not the latest revision', () => {
    const awardedCs = {
      ...cs,
      awarded: { quotationId: 'r0', kind: 'IOCT', revision: '00', price: 99500, grandTotal: 100000, budget: 61000, awardedAt: '2026-10-16', awardedBy: 'TJ' },
    } as CalcsheetProject;
    expect(resolveCalcsheetPrice(ops, [awardedCs], [rev00, rev01])).toMatchObject({ price: 99500, source: 'awarded', quotationId: 'r0', quotationLabel: 'IOCT rev 00' });
    const budget = resolveCalcsheetBudget(ops, [awardedCs], [rev00, rev01]);
    expect(budget).toMatchObject({ amount: 61000, quotationId: 'r0', value: 100000, margin: 39000 });
  });

  test('no proposal match: null', () => {
    expect(resolveCalcsheetPrice({ id: 'other' }, [cs], [rev00])).toBeNull();
  });
});
