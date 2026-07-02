import type { ContribRates } from '../utils/governmentContrib';
import type { FundingSource } from '../data/financeCategories';

export type EmployeeType = 'FIELD' | 'OFFICE';
export type PayFrequency = 'WEEKLY' | 'SEMI_MONTHLY' | 'MONTHLY';

export interface Employee {
  id: string;
  employeeNumber: string;
  name: string; // "LASTNAME, Firstname"
  designation: string;
  employeeType: EmployeeType;
  payFrequency: PayFrequency;
  dailyRate?: number;     // FIELD only
  monthlyRate?: number;   // OFFICE only
  mealAllowance?: number; // per day
  projectId?: string;
  dateHired: string;      // ISO string
  isActive: boolean;
  sssNumber?: string;
  philhealthNumber?: string;
  pagibigNumber?: string;
  tinNumber?: string;
  /**
   * Per-agency remittance toggles. Undefined/true = compute & deduct as normal;
   * false = skip that agency's computation entirely (payslip shows 0 for it).
   * Lets a project-based hire, or any period where remittance isn't actually being
   * filed yet, be paid basic pay without falsely implying money was withheld/remitted.
   */
  sssEnabled?: boolean;
  philhealthEnabled?: boolean;
  pagibigEnabled?: boolean;
  withholdingTaxEnabled?: boolean;
  createdAt?: string;
}

export type DayType =
  | 'REGULAR'
  | 'REST_DAY'
  | 'SPECIAL_HOLIDAY'
  | 'REGULAR_HOLIDAY'
  | 'DOUBLE_HOLIDAY';

export interface DTREntry {
  id?: string;
  employeeId: string;
  entryDate: string; // YYYY-MM-DD
  timeIn?: string;   // HH:MM (24h)
  timeOut?: string;   // HH:MM (24h)
  dayType: DayType;
  regularHours: number;
  overtimeHours: number;
  nightDiffHours: number;
  isAbsent: boolean;
  tardinessMinutes: number;
  remarks?: string;
  submittedAt?: string;
  clockInLocation?: { lat: number; lng: number; accuracy: number };
  clockOutLocation?: { lat: number; lng: number; accuracy: number };
}

export interface PayrollRun {
  id: string;
  periodStart: string; // ISO string
  periodEnd: string;
  payDate: string;
  status: 'DRAFT' | 'APPROVED' | 'PAID';
  createdBy: string;
  createdAt: string;
  /**
   * Statutory contribution rates snapshotted at run creation. Payslips for this run are
   * computed with these rates, so refreshing the global CONTRIB_DEFAULTS never retro-changes
   * an existing run. Optional for backward-compat with runs created before snapshotting.
   */
  contribRates?: ContribRates;
  /**
   * How the office-staff share of this run was funded. Mirrors the expense-monitoring
   * fundingSource idiom — when 'investor_outofpocket', approving the run links the
   * overhead-expenses sync rows (salaries + employer gov't contributions) to an
   * Investment Tracker entry the same way a manually-entered expense would.
   */
  fundingSource?: FundingSource;
}

export interface Payslip {
  id?: string;
  payrollRunId: string;
  employeeId: string;
  employeeSnapshot: Employee;

  // Attendance
  workingDays: number;
  regularHours: number;
  overtimeHours: number;
  nightDiffHours: number;

  // Earnings
  basicPay: number;
  mealAllowance: number;
  otPayRegular: number;
  otPayRestDay: number;
  otPayRegularHoliday: number;
  regularHolidayPay: number;
  specialHolidayPay: number;
  nightDifferential: number;
  deMinimisBenefits: number;
  otherBenefitsNonTax: number;
  thirteenthMonthAccrual: number;
  adjustment: number;
  commission: number;

  // Deductions
  empSSS: number;
  empPhilhealth: number;
  empPagibig: number;
  withholdingTax: number;
  tardinessDeduction: number;
  otherDeduction: number;

  // Employer share
  erSSS: number;
  erPhilhealth: number;
  erPagibig: number;

  // Totals
  grossPay: number;
  totalDeductions: number;
  netPay: number;

  remarks?: string;
  computedAt?: string;
  /**
   * Raw DTR input this payslip was computed from. Not used in payslip math — kept so a
   * superadmin editing an existing run can reload the DTR Entry step with the original
   * per-employee inputs instead of just the derived pay figures (which alone can't be
   * reversed back into hours/days worked).
   */
  dtrInput?: DTRInput;
}

// For DTR wizard: aggregated per-employee input
export interface DTRInput {
  employeeId: string;
  employee: Employee;
  workingDays: number;
  regularHours: number;
  overtimeHours: number;
  nightDiffHours: number;
  tardinessMinutes: number;
  dayType: DayType;
  regularHolidayDays: number;
  specialHolidayDays: number;
  restDayOTHours: number;
  regularHolidayOTHours: number;
  regularHolidayRestDayDays?: number;
  specialHolidayRestDayDays?: number;
  regularHolidayRestDayOTHours?: number;
  specialHolidayRestDayOTHours?: number;
}
