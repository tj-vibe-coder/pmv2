/**
 * Philippine Withholding Tax — TRAIN Law (R.A. 10963)
 * Annual income tax brackets effective 2023 onward.
 */

const TAX_TABLE: { min: number; max: number; base: number; rate: number }[] = [
  { min: 0,       max: 250000,   base: 0,       rate: 0    },
  { min: 250001,  max: 400000,   base: 0,       rate: 0.15 },
  { min: 400001,  max: 800000,   base: 22500,   rate: 0.20 },
  { min: 800001,  max: 2000000,  base: 102500,  rate: 0.25 },
  { min: 2000001, max: 8000000,  base: 402500,  rate: 0.30 },
  { min: 8000001, max: Infinity, base: 2202500, rate: 0.35 },
];

/**
 * Compute annual withholding tax from annual taxable income.
 * Taxable income = gross income − non-taxable benefits − government contributions
 */
export function computeAnnualTax(annualTaxableIncome: number): number {
  if (annualTaxableIncome <= 0) return 0;
  const bracket = TAX_TABLE.find(
    (b) => annualTaxableIncome >= b.min && annualTaxableIncome <= b.max
  );
  if (!bracket) return 0;
  return bracket.base + (annualTaxableIncome - bracket.min) * bracket.rate;
}

/**
 * Convert annual tax to per-payroll-period withholding.
 * MONTHLY:      ÷ 12
 * SEMI_MONTHLY: ÷ 24
 * WEEKLY:       ÷ 52
 */
export function computePerPeriodTax(
  annualTaxableIncome: number,
  frequency: 'WEEKLY' | 'SEMI_MONTHLY' | 'MONTHLY'
): number {
  const annual = computeAnnualTax(annualTaxableIncome);
  if (frequency === 'MONTHLY') return annual / 12;
  if (frequency === 'SEMI_MONTHLY') return annual / 24;
  return annual / 52;
}

/**
 * Annualize a per-period taxable income for bracket lookup.
 */
export function annualize(perPeriodIncome: number, frequency: 'WEEKLY' | 'SEMI_MONTHLY' | 'MONTHLY'): number {
  if (frequency === 'MONTHLY') return perPeriodIncome * 12;
  if (frequency === 'SEMI_MONTHLY') return perPeriodIncome * 24;
  return perPeriodIncome * 52;
}

// Non-taxable thresholds (TRAIN Law)
export const NON_TAXABLE = {
  deMinimisMonthly: 10000,   // ₱10,000/month max de minimis
  thirteenthMonthAnnual: 90000, // ₱90,000/year 13th month + other benefits
};
