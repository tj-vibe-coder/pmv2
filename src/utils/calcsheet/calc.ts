import type {
  ComponentLine,
  GeneralReqLine,
  ManpowerEntry,
  Quotation,
  QuotationTotals,
  ServiceLine,
} from '../../types/Quotation';

export function lineGeneralTotal(l: GeneralReqLine): number {
  return (l.unitPrice || 0) * (l.qty || 0);
}

export function componentSellingUnit(l: ComponentLine, productMarkupPct: number): number {
  const adjusted = componentCostUnit(l) * (1 + (l.contingencyPct || 0) / 100);
  const markup = l.markupPct != null ? l.markupPct : productMarkupPct;
  return adjusted * (1 + (markup || 0) / 100);
}

export function componentCostUnit(l: ComponentLine): number {
  const base = (l.unitCost || 0) * (l.forex || 1);
  return base * (1 - (l.discountPct || 0) / 100);
}

export function componentWithContingencyUnit(l: ComponentLine): number {
  return componentCostUnit(l) * (1 + (l.contingencyPct || 0) / 100);
}

export function componentLineTotal(l: ComponentLine, productMarkupPct: number): number {
  return componentSellingUnit(l, productMarkupPct) * (l.qty || 0);
}

export function componentLineCost(l: ComponentLine): number {
  return componentCostUnit(l) * (l.qty || 0);
}

export function componentLineWithContingency(l: ComponentLine): number {
  return componentWithContingencyUnit(l) * (l.qty || 0);
}

export function manpowerCost(m: ManpowerEntry): number {
  return (m.headcount || 0) * (m.mandays || 0) * ((m.dailyRate || 0) + (m.allowance || 0));
}

export function manpowerTotalCost(rows: ManpowerEntry[]): number {
  return rows.reduce((s, m) => s + manpowerCost(m), 0);
}

/** Daily cost of the whole team (ignoring mandays — used for per-line scope pricing). */
export function manpowerDailyRate(rows: ManpowerEntry[]): number {
  return rows.reduce((s, m) => s + (m.headcount || 0) * ((m.dailyRate || 0) + (m.allowance || 0)), 0);
}

export function servicesSubtotal(
  services: ServiceLine[],
  manpower: ManpowerEntry[],
  laborMarkupPct: number,
  fromManpower: boolean,
): { subtotal: number; cost: number } {
  if (fromManpower) {
    const cost = manpowerTotalCost(manpower);
    return { subtotal: cost * (1 + (laborMarkupPct || 0) / 100), cost };
  }
  const subtotal = services.reduce((s, l) => s + (l.amount || 0), 0);
  return { subtotal, cost: subtotal };
}

export function computeTotals(q: Quotation): QuotationTotals {
  if (q.formulaVersion === 'legacy') {
    if (q.legacyTotalsSnapshot) return q.legacyTotalsSnapshot;
    return computeTotalsLegacy(q);
  }
  const generalReqtsQty = q.exportGeneralReqtsAsLot ? Math.max(1, q.generalReqtsExportQty || 1) : 1;
  const engineeringServicesQty = q.servicesFromManpower ? Math.max(1, q.engineeringServicesQty || 1) : 1;

  // General Requirements: cost → per-line or global markup.
  const generalReqtsUnitCost = q.generalReqts.reduce((s, l) => s + lineGeneralTotal(l), 0);
  const generalReqtsCost = generalReqtsUnitCost * generalReqtsQty;
  const generalReqtsWithContingency = generalReqtsCost;
  const hasPerLineGenMarkup = q.generalReqts.some(l => l.markupPct != null);
  const generalReqtsSubtotal = hasPerLineGenMarkup
    ? q.generalReqts.reduce((s, l) => {
        const base = lineGeneralTotal(l);
        const markup = l.markupPct != null ? l.markupPct : (q.generalReqMarkupPct || 0);
        return s + base * (1 + markup / 100);
      }, 0) * generalReqtsQty
    : generalReqtsWithContingency * (1 + (q.generalReqMarkupPct || 0) / 100);

  // Components: raw cost → per-line contingency → markup.
  const componentsSubtotal = q.components.reduce(
    (s, l) => s + componentLineTotal(l, q.productMarkupPct),
    0,
  );
  const componentsCost = q.components.reduce((s, l) => s + componentLineCost(l), 0);
  const componentsWithContingency = q.components.reduce(
    (s, l) => s + componentLineWithContingency(l),
    0,
  );

  // Labor: manpower cost → markup. No contingency layer (rates carry their own buffer);
  // laborMarkupPct is the profit on engineering services.
  let laborCost: number;
  let servicesSub: number;
  let laborWithContingency: number;
  if (q.servicesFromManpower) {
    if (q.servicesPerLinePricing) {
      // Per-line pricing: each scope item stores its own amount (auto-computed from
      // days × team daily rate, or manually entered). laborCost is the raw manpower
      // cost based on days for margin calculation.
      const dailyRate = manpowerDailyRate(q.manpower);
      laborCost = q.services.reduce((s, l) => s + ((l.days || 0) * dailyRate), 0);
      laborWithContingency = laborCost;
      servicesSub = q.services.reduce((s, l) => s + (l.amount || 0), 0);
    } else {
      laborCost = manpowerTotalCost(q.manpower) * engineeringServicesQty;
      laborWithContingency = laborCost;
      servicesSub = laborCost * (1 + (q.laborMarkupPct || 0) / 100);
    }
  } else {
    // Manual lump-sum lines: take amounts as the final subtotal (user already includes their own buffer)
    servicesSub = q.services.reduce((s, l) => s + (l.amount || 0), 0);
    laborCost = servicesSub;
    laborWithContingency = servicesSub;
  }

  const subtotal = generalReqtsSubtotal + componentsSubtotal + servicesSub;
  const discount = subtotal * ((q.discountPct || 0) / 100);
  const afterDiscount = subtotal - discount;
  const vat = afterDiscount * ((q.vatPct || 0) / 100);
  const grandTotal = afterDiscount + vat;

  return {
    generalReqtsCost,
    generalReqtsWithContingency,
    generalReqtsSubtotal,
    componentsCost,
    componentsWithContingency,
    componentsSubtotal,
    laborCost,
    laborWithContingency,
    servicesSubtotal: servicesSub,
    subtotal,
    discount,
    vat,
    grandTotal,
  };
}

// Legacy formulation matches the historical Excel templates:
//   Components: additive (1 + contingency - discount) instead of multiplicative
//   Labor: per-role contingency applied to each worker's unit price before summing
//   General Reqts: contingency is either applied or already baked into unit costs
function componentSellingUnitLegacy(l: ComponentLine, productMarkupPct: number): number {
  const base = (l.unitCost || 0) * (l.forex || 1);
  const adjusted = base * (1 + (l.contingencyPct || 0) / 100 - (l.discountPct || 0) / 100);
  return adjusted * (1 + (productMarkupPct || 0) / 100);
}

function componentCostUnitLegacy(l: ComponentLine): number {
  const base = (l.unitCost || 0) * (l.forex || 1);
  return base * (1 + (l.contingencyPct || 0) / 100 - (l.discountPct || 0) / 100);
}

function manpowerLineCostLegacy(m: ManpowerEntry, contPct: number): number {
  const unit = ((m.dailyRate || 0) + (m.allowance || 0)) * (1 + (contPct || 0) / 100);
  return (m.headcount || 0) * (m.mandays || 0) * unit;
}

export function computeTotalsLegacy(q: Quotation): QuotationTotals {
  const contPct = q.globalContingencyPct || 0;
  const cont = contPct / 100;
  const skipGenReqContingency = q.generalReqContingencyMode === 'baked';

  const generalReqtsCost = q.generalReqts.reduce((s, l) => s + lineGeneralTotal(l), 0);
  const generalReqtsWithContingency = skipGenReqContingency
    ? generalReqtsCost
    : generalReqtsCost * (1 + cont);
  const generalReqtsSubtotal =
    generalReqtsWithContingency * (1 + (q.generalReqMarkupPct || 0) / 100);

  const componentsCost = q.components.reduce(
    (s, l) => s + componentCostUnitLegacy(l) * (l.qty || 0),
    0,
  );
  const componentsSubtotal = q.components.reduce(
    (s, l) => s + componentSellingUnitLegacy(l, q.productMarkupPct) * (l.qty || 0),
    0,
  );

  let laborCost: number;
  let laborWithContingency: number;
  let servicesSub: number;
  if (q.servicesFromManpower) {
    laborCost = manpowerTotalCost(q.manpower);
    laborWithContingency = q.manpower.reduce((s, m) => s + manpowerLineCostLegacy(m, contPct), 0);
    servicesSub = laborWithContingency * (1 + (q.laborMarkupPct || 0) / 100);
  } else {
    servicesSub = q.services.reduce((s, l) => s + (l.amount || 0), 0);
    laborCost = servicesSub;
    laborWithContingency = servicesSub;
  }

  const subtotal = generalReqtsSubtotal + componentsSubtotal + servicesSub;
  const discount = subtotal * ((q.discountPct || 0) / 100);
  const afterDiscount = subtotal - discount;
  const vat = afterDiscount * ((q.vatPct || 0) / 100);
  const grandTotal = afterDiscount + vat;

  return {
    generalReqtsCost,
    generalReqtsWithContingency,
    generalReqtsSubtotal,
    componentsCost,
    componentsWithContingency: componentsCost,
    componentsSubtotal,
    laborCost,
    laborWithContingency,
    servicesSubtotal: servicesSub,
    subtotal,
    discount,
    vat,
    grandTotal,
  };
}

// IOCT gross margin from the quotation's snapshot.
// For non-legacy: cost fields are real, always returns a value.
// For legacy: returns null when costs weren't backfilled — those snapshots
// store cost=subtotal (placeholder), so margin would falsely read as zero.
export function ioctMargin(t: QuotationTotals): { value: number; pct: number } | null {
  const net = t.subtotal - t.discount;
  if (net <= 0) return null;
  const totalCost = t.generalReqtsCost + t.componentsCost + t.laborCost;
  const totalSubtotals = t.generalReqtsSubtotal + t.componentsSubtotal + t.servicesSubtotal;
  // Cost placeholder: totalCost equals sum of subtotals → no real cost data
  if (Math.abs(totalCost - totalSubtotals) < 0.01) return null;
  return { value: net - totalCost, pct: ((net - totalCost) / net) * 100 };
}

export const PHP = (n: number): string =>
  'PHP ' +
  (Number.isFinite(n) ? n : 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Number only — no "PHP" prefix. Used for line-item prices in the PDF. */
export const NUM = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const PCT = (n: number): string => `${(n || 0).toFixed(2)}%`;
