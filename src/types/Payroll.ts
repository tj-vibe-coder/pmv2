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
  entryDate: string; // ISO string
  dayType: DayType;
  regularHours: number;
  overtimeHours: number;
  nightDiffHours: number;
  isAbsent: boolean;
  tardinessMinutes: number;
}

export interface PayrollRun {
  id: string;
  periodStart: string; // ISO string
  periodEnd: string;
  payDate: string;
  status: 'DRAFT' | 'APPROVED' | 'PAID';
  createdBy: string;
  createdAt: string;
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
}
