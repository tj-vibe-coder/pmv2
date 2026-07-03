/**
 * IOCT Payroll Computation Engine
 * Based on: Philippine Labor Code, DOLE Department Orders,
 * SSS Circular 2023-002, PhilHealth Circular 2023-0014, TRAIN Law (R.A. 10963)
 */

import { Employee, DTRInput, Payslip, RateType } from '../types/Payroll';
import { computeSSS, computePhilhealth, computePagibig, toPerPeriod, ContribRates, CONTRIB_DEFAULTS } from './governmentContrib';
import { annualize, computePerPeriodTax } from './taxTable';

// ─── Rate Basis ────────────────────────────────────────────────────────────

/**
 * Resolve an employee's rate basis. When unset it falls back to the historical
 * convention (FIELD→DAILY, OFFICE→MONTHLY) so existing records are unchanged.
 */
export function resolveRateType(emp: Pick<Employee, 'rateType' | 'employeeType'>): RateType {
  return emp.rateType ?? (emp.employeeType === 'FIELD' ? 'DAILY' : 'MONTHLY');
}

// ─── Basic Pay ───────────────────────────────────────────────────────────────

/**
 * Compute basic pay.
 * DAILY basis: dailyRate × workingDays
 * MONTHLY basis: monthlyRate divided per the employee's own payFrequency (full for MONTHLY, ÷2 for
 * SEMI_MONTHLY, ÷4.33 for WEEKLY) — same divisor government contributions already use via
 * toPerPeriod(), so a run's basic pay and its statutory deductions stay on the same cadence.
 */
export function computeBasicPay(employee: Employee, workingDays: number): number {
  if (resolveRateType(employee) === 'DAILY') {
    return (employee.dailyRate ?? 0) * workingDays;
  }
  return toPerPeriod(employee.monthlyRate ?? 0, employee.payFrequency);
}

// ─── Overtime ─────────────────────────────────────────────────────────────────

/** Hourly rate derived from daily rate (8-hour workday standard). */
export function hourlyRate(dailyRate: number): number {
  return dailyRate / 8;
}

/**
 * OT on Regular Day: hourly rate × 1.25 per OT hour.
 * Labor Code Art. 87.
 */
export function computeOTRegular(dailyRate: number, otHours: number): number {
  return otHours * hourlyRate(dailyRate) * 1.25;
}

/**
 * OT on Rest Day / Special Non-Working Holiday: base is 130% of daily rate,
 * OT premium is an additional 30% of that base per hour.
 * Labor Code Art. 93–94.
 */
export function computeOTRestDay(dailyRate: number, otHours: number): number {
  return otHours * hourlyRate(dailyRate) * 1.30 * 1.30;
}

/**
 * OT on Regular Holiday: base is 200% of daily rate,
 * OT premium is 30% of that base per hour.
 * Labor Code Art. 94.
 */
export function computeOTRegularHoliday(dailyRate: number, otHours: number): number {
  return otHours * hourlyRate(dailyRate) * 2.00 * 1.30;
}

/**
 * OT on Double Holiday: base is 300% of daily rate,
 * OT premium is 30% of that base per hour.
 */
export function computeOTDoubleHoliday(dailyRate: number, otHours: number): number {
  return otHours * hourlyRate(dailyRate) * 3.00 * 1.30;
}

// ─── Holiday Pay ──────────────────────────────────────────────────────────────

/**
 * Regular Holiday: employee gets 100% daily rate even if absent.
 * If worked: 200% of daily rate.
 * Labor Code Art. 94.
 */
export function computeRegularHolidayPay(dailyRate: number, worked: boolean): number {
  return dailyRate * (worked ? 2.0 : 1.0);
}

/**
 * Special Non-Working Holiday: no work no pay.
 * If worked: 130% of daily rate.
 * Proclamation / DOLE rules.
 */
export function computeSpecialHolidayPay(dailyRate: number, worked: boolean): number {
  if (!worked) return 0;
  return dailyRate * 1.30;
}

// ─── Holiday-on-Rest-Day Pay ──────────────────────────────────────────────────

// DOLE holiday-on-rest-day day pay (worked): Regular Holiday on rest day = 260%, Special Non-Working Holiday on rest day = 150%
export function computeRegularHolidayRestDayPay(dailyRate: number): number {
  return dailyRate * 2.60;
}
export function computeSpecialHolidayRestDayPay(dailyRate: number): number {
  return dailyRate * 1.50;
}
// OT on those days: OT premium (x1.30) applied on the higher base
export function computeOTRegularHolidayRestDay(dailyRate: number, otHours: number): number {
  return otHours * hourlyRate(dailyRate) * 2.60 * 1.30;
}
export function computeOTSpecialHolidayRestDay(dailyRate: number, otHours: number): number {
  return otHours * hourlyRate(dailyRate) * 1.50 * 1.30;
}

// ─── Night Differential ───────────────────────────────────────────────────────

/**
 * Night differential applies to hours worked between 10PM and 6AM.
 * Premium: 10% of regular hourly rate per night diff hour.
 * Labor Code Art. 86.
 */
export function computeNightDiff(dailyRate: number, nightDiffHours: number): number {
  return nightDiffHours * hourlyRate(dailyRate) * 0.10;
}

// ─── Tardiness ────────────────────────────────────────────────────────────────

/**
 * Tardiness deduction per minute: (dailyRate / 8 hours / 60 minutes).
 */
export function computeTardinessDeduction(dailyRate: number, tardinessMinutes: number): number {
  return (dailyRate / 8 / 60) * tardinessMinutes;
}

// ─── Meal Allowance ───────────────────────────────────────────────────────────

export function computeMealAllowance(employee: Employee, workingDays: number): number {
  return (employee.mealAllowance ?? 0) * workingDays;
}

// ─── Full Payslip Computation ─────────────────────────────────────────────────

/**
 * Compute a complete payslip for one employee given their DTR input.
 * All monetary values rounded to 2 decimal places.
 */
export function computePayslip(
  payrollRunId: string,
  dtr: DTRInput,
  manualAdjustment = 0,
  rates: ContribRates = CONTRIB_DEFAULTS
): Payslip {
  const emp = dtr.employee;
  const dailyRate = emp.dailyRate ?? 0;
  // Premiums (OT / holiday / night-diff / tardiness) apply only to a DAILY rate
  // basis; a monthly salary is treated as all-inclusive. Rate basis, not the
  // FIELD/OFFICE classification, drives this.
  const isDaily = resolveRateType(emp) === 'DAILY';
  // Per-employee toggles (absent = enabled, preserving legacy behavior).
  const payOvertime = emp.applyOvertimePay !== false;
  const applyDeductions = emp.applyDeductions !== false;

  // Basic pay
  const basicPay = computeBasicPay(emp, dtr.workingDays);

  // Meal allowance
  const mealAllowance = computeMealAllowance(emp, dtr.workingDays);

  // OT pay (zeroed when the employee's contract has no OT; hours stay recorded)
  const otPayRegular = isDaily && payOvertime ? computeOTRegular(dailyRate, dtr.overtimeHours) : 0;
  const otPayRestDay = isDaily && payOvertime
    ? computeOTRestDay(dailyRate, dtr.restDayOTHours ?? 0)
      + computeOTSpecialHolidayRestDay(dailyRate, dtr.specialHolidayRestDayOTHours ?? 0)
    : 0;
  const otPayRegularHoliday = isDaily && payOvertime
    ? computeOTRegularHoliday(dailyRate, dtr.regularHolidayOTHours ?? 0)
      + computeOTRegularHolidayRestDay(dailyRate, dtr.regularHolidayRestDayOTHours ?? 0)
    : 0;

  // Holiday pay
  const regularHolidayPay = isDaily
    ? (dtr.regularHolidayDays ?? 0) * computeRegularHolidayPay(dailyRate, true)
      + (dtr.regularHolidayRestDayDays ?? 0) * computeRegularHolidayRestDayPay(dailyRate)
    : 0;
  const specialHolidayPay = isDaily
    ? (dtr.specialHolidayDays ?? 0) * computeSpecialHolidayPay(dailyRate, true)
      + (dtr.specialHolidayRestDayDays ?? 0) * computeSpecialHolidayRestDayPay(dailyRate)
    : 0;

  // Night differential
  const nightDifferential = isDaily ? computeNightDiff(dailyRate, dtr.nightDiffHours) : 0;

  // Tardiness (skipped when the employee opts out of deductions)
  const tardinessDeduction = applyDeductions && isDaily
    ? computeTardinessDeduction(dailyRate, dtr.tardinessMinutes)
    : 0;

  // Monthly basis for government contributions
  const monthlyBasic = isDaily
    ? dailyRate * 26 // standard 26 working days/month
    : emp.monthlyRate ?? 0;

  // Per-agency remittance toggles (undefined defaults to enabled — see Employee type).
  const sssOn = emp.sssEnabled !== false;
  const phOn = emp.philhealthEnabled !== false;
  const piOn = emp.pagibigEnabled !== false;
  const taxOn = emp.withholdingTaxEnabled !== false;

  const sss = sssOn ? computeSSS(monthlyBasic, rates) : { employee: 0, employer: 0 };
  const ph = phOn ? computePhilhealth(monthlyBasic, rates) : { employee: 0, employer: 0 };
  const pagibig = piOn ? computePagibig(monthlyBasic, rates) : { employee: 0, employer: 0 };

  const freq = emp.payFrequency;
  // Employee share zeroed when deductions are off; employer share always computed.
  const empSSS = applyDeductions ? round2(toPerPeriod(sss.employee, freq)) : 0;
  const empPH = applyDeductions ? round2(toPerPeriod(ph.employee, freq)) : 0;
  const empPI = applyDeductions ? round2(toPerPeriod(pagibig.employee, freq)) : 0;
  const erSSS = round2(toPerPeriod(sss.employer, freq));
  const erPH = round2(toPerPeriod(ph.employer, freq));
  const erPI = round2(toPerPeriod(pagibig.employer, freq));

  // Gross earnings (before deductions)
  const grossEarnings =
    basicPay +
    mealAllowance +
    otPayRegular +
    otPayRestDay +
    otPayRegularHoliday +
    regularHolidayPay +
    specialHolidayPay +
    nightDifferential +
    manualAdjustment;

  // Taxable income for this period (subtract gov contributions + meal allowance)
  const taxablePerPeriod = Math.max(
    0,
    grossEarnings - empSSS - empPH - empPI - mealAllowance
  );
  const annualTaxable = annualize(taxablePerPeriod, freq);
  const withholdingTax = (applyDeductions && taxOn) ? round2(computePerPeriodTax(annualTaxable, freq)) : 0;

  const totalDeductions = round2(
    empSSS + empPH + empPI + withholdingTax + tardinessDeduction
  );

  const grossPay = round2(grossEarnings);
  const netPay = round2(grossPay - totalDeductions);

  return {
    payrollRunId,
    employeeId: emp.id,
    employeeSnapshot: emp,
    workingDays: dtr.workingDays,
    regularHours: dtr.regularHours,
    overtimeHours: dtr.overtimeHours,
    nightDiffHours: dtr.nightDiffHours,
    basicPay: round2(basicPay),
    mealAllowance: round2(mealAllowance),
    otPayRegular: round2(otPayRegular),
    otPayRestDay: round2(otPayRestDay),
    otPayRegularHoliday: round2(otPayRegularHoliday),
    regularHolidayPay: round2(regularHolidayPay),
    specialHolidayPay: round2(specialHolidayPay),
    nightDifferential: round2(nightDifferential),
    deMinimisBenefits: 0,
    otherBenefitsNonTax: 0,
    thirteenthMonthAccrual: round2(basicPay / 12),
    adjustment: round2(manualAdjustment),
    commission: 0,
    empSSS,
    empPhilhealth: empPH,
    empPagibig: empPI,
    withholdingTax,
    tardinessDeduction: round2(tardinessDeduction),
    otherDeduction: 0,
    erSSS,
    erPhilhealth: erPH,
    erPagibig: erPI,
    grossPay,
    totalDeductions,
    netPay,
    computedAt: new Date().toISOString(),
    dtrInput: dtr,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
