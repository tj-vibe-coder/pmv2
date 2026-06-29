import { computePayslip } from './payrollEngine';
import { DTRInput } from '../types/Payroll';
import { CONTRIB_DEFAULTS } from './governmentContrib';

describe('Payroll Engine Unit Tests', () => {
  const fieldEmp = {
    id: 'e1',
    employeeNumber: '001',
    name: 'Test',
    designation: 'Tech',
    employeeType: 'FIELD' as const,
    payFrequency: 'SEMI_MONTHLY' as const,
    dailyRate: 1000,
    monthlyRate: 0,
    mealAllowance: 0,
    dateHired: '2025-01-01',
    isActive: true,
  };

  const baseDtr: DTRInput = {
    employeeId: 'e1',
    employee: fieldEmp,
    workingDays: 0,
    regularHours: 0,
    overtimeHours: 0,
    nightDiffHours: 0,
    tardinessMinutes: 0,
    dayType: 'REGULAR' as const,
    regularHolidayDays: 0,
    specialHolidayDays: 0,
    restDayOTHours: 0,
    regularHolidayOTHours: 0,
    regularHolidayRestDayDays: 0,
    specialHolidayRestDayDays: 0,
    regularHolidayRestDayOTHours: 0,
    specialHolidayRestDayOTHours: 0,
  };

  test('1. Regular holiday on rest day (worked)', () => {
    const dtr: DTRInput = {
      ...baseDtr,
      regularHolidayRestDayDays: 1,
    };
    const payslip = computePayslip('run-1', dtr, 0, CONTRIB_DEFAULTS);
    expect(payslip.regularHolidayPay).toBeCloseTo(2600.00, 2);
  });

  test('2. Special holiday on rest day (worked)', () => {
    const dtr: DTRInput = {
      ...baseDtr,
      specialHolidayRestDayDays: 1,
    };
    const payslip = computePayslip('run-1', dtr, 0, CONTRIB_DEFAULTS);
    expect(payslip.specialHolidayPay).toBeCloseTo(1500.00, 2);
  });

  test('3. Regular-holiday-rest-day OT', () => {
    const dtr: DTRInput = {
      ...baseDtr,
      regularHolidayRestDayOTHours: 1,
    };
    const payslip = computePayslip('run-1', dtr, 0, CONTRIB_DEFAULTS);
    expect(payslip.otPayRegularHoliday).toBeCloseTo(422.50, 2);
  });

  test('4. Special-holiday-rest-day OT', () => {
    const dtr: DTRInput = {
      ...baseDtr,
      specialHolidayRestDayOTHours: 1,
    };
    const payslip = computePayslip('run-1', dtr, 0, CONTRIB_DEFAULTS);
    expect(payslip.otPayRestDay).toBeCloseTo(243.75, 2);
  });

  test('5. Existing fields still work', () => {
    const dtr: DTRInput = {
      ...baseDtr,
      regularHolidayDays: 1,
      specialHolidayDays: 1,
    };
    const payslip = computePayslip('run-1', dtr, 0, CONTRIB_DEFAULTS);
    expect(payslip.regularHolidayPay).toBeCloseTo(2000.00, 2);
    expect(payslip.specialHolidayPay).toBeCloseTo(1300.00, 2);
  });

  test('6. 13th-month accrual and basic calculations', () => {
    const dtr: DTRInput = {
      ...baseDtr,
      workingDays: 10,
    };
    const payslip = computePayslip('run-1', dtr, 0, CONTRIB_DEFAULTS);

    // thirteenthMonthAccrual should = round(10000 / 12 * 100) / 100 = 833.33
    expect(payslip.thirteenthMonthAccrual).toBeCloseTo(833.33, 2);

    // grossPay must NOT include it (grossPay for workingDays:10 alone = 10000)
    expect(payslip.grossPay).toBeCloseTo(10000.00, 2);

    // netPay must be < grossPay due to deductions
    expect(payslip.netPay).toBeLessThan(payslip.grossPay);

    // netPay must NOT include the 833.33 (netPay = grossPay - totalDeductions)
    expect(payslip.netPay).toBeCloseTo(payslip.grossPay - payslip.totalDeductions, 2);
  });

  test('7. OFFICE employee gets 0 for holiday/rest-day pay', () => {
    const officeEmp = {
      ...fieldEmp,
      employeeType: 'OFFICE' as const,
      monthlyRate: 26000,
      dailyRate: 0,
    };
    const dtr: DTRInput = {
      ...baseDtr,
      employee: officeEmp,
      regularHolidayRestDayDays: 1,
    };
    const payslip = computePayslip('run-1', dtr, 0, CONTRIB_DEFAULTS);
    expect(payslip.regularHolidayPay).toBeCloseTo(0.00, 2);
  });
});
