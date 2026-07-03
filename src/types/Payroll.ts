import type { ContribRates } from '../utils/governmentContrib';

export type EmployeeType = 'FIELD' | 'OFFICE';
export type PayFrequency = 'WEEKLY' | 'SEMI_MONTHLY' | 'MONTHLY';
/** How the employee's pay is quoted. Drives basic-pay computation and premium eligibility, independent of FIELD/OFFICE classification. */
export type RateType = 'DAILY' | 'MONTHLY';

export interface Employee {
  id: string;
  userId?: string;        // linked user account ID (from `users` collection)
  employeeNumber: string;
  name: string; // "LASTNAME, Firstname"
  designation: string;
  employeeType: EmployeeType;
  payFrequency: PayFrequency;
  /** Rate basis. Absent = derived from employeeType (FIELD→DAILY, OFFICE→MONTHLY) for backward compatibility. */
  rateType?: RateType;
  dailyRate?: number;     // used when rateType is DAILY
  monthlyRate?: number;   // used when rateType is MONTHLY
  mealAllowance?: number; // per day
  projectId?: string;
  dateHired: string;      // ISO string
  isActive: boolean;
  sssNumber?: string;
  philhealthNumber?: string;
  pagibigNumber?: string;
  tinNumber?: string;
  /** When false, government + tardiness deductions are skipped (net pay = gross). Absent/true = deductions apply. Employer share is unaffected. */
  applyDeductions?: boolean;
  /** When false, overtime pay is ₱0 (OT hours are still recorded). Absent/true = OT is paid. */
  applyOvertimePay?: boolean;
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

/** A named location (with coordinates) used to attribute clocked hours to a site. */
export interface WorkSite {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number; // a clock-in within this distance is attributed to the site
  createdAt?: string;
  updatedAt?: string;
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
