# 💼 IOCT Payroll Module — Vibe Code Instructions
> For: `pmv2` (React 18 + TypeScript + MUI v5)  
> Stack: React · TypeScript · Material-UI · Recharts · Node.js/Express backend  
> Database: **Firebase (Firestore)**  
> Reference payslips: CMR Philippines (field/weekly) + Renzel Payslip (office/monthly)

---

## 🎯 MODULE OVERVIEW

Build a **Payroll Management Module** integrated into the existing `pmv2` Project Monitoring System. The payroll module must:

- Handle **two employee types**: Field Workers (weekly/daily-rate) and Office Staff (monthly-rate)
- Compute all PH Labor Code OT premiums, holiday pay, and night differential
- Auto-calculate mandatory government deductions (SSS, PhilHealth, Pag-IBIG, Withholding Tax)
- Generate printable payslips matching the CMR Philippines format
- Maintain a payroll register (per cut-off period)
- **Restricted to authorized users only** — no project cost allocation (standalone for now)

---

## 🗂️ MODULE STRUCTURE

Add the following to the existing `src/` folder:

```
src/
├── components/
│   ├── payroll/
│   │   ├── PayrollDashboard.tsx       # Payroll summary KPIs
│   │   ├── PayrollRegister.tsx        # Table of all payroll runs
│   │   ├── PayrollRunForm.tsx         # Create/edit a payroll run
│   │   ├── PayslipCard.tsx            # Individual payslip display + print
│   │   ├── EmployeePayrollTable.tsx   # All employees in a payroll run
│   │   ├── GovernmentContribTable.tsx # SSS/PhilHealth/Pag-IBIG summary
│   │   └── HolidayCalendar.tsx        # PH holiday management
├── types/
│   └── Payroll.ts                     # All TypeScript interfaces
├── utils/
│   ├── payrollEngine.ts               # Core computation logic
│   ├── governmentContrib.ts           # SSS/PhilHealth/Pag-IBIG tables
│   ├── taxTable.ts                    # TRAIN Law withholding tax
│   └── holidayUtils.ts                # Holiday classification logic
└── data/
    └── phHolidays.ts                  # Static PH holiday list (current year)
```

---

## 📐 DATA MODELS — `src/types/Payroll.ts`

```typescript
// Employee Type
export type EmployeeType = 'FIELD' | 'OFFICE';
export type PayFrequency = 'WEEKLY' | 'SEMI_MONTHLY' | 'MONTHLY';

// Employee Master
export interface Employee {
  id: string;
  employeeNumber: string;
  name: string;                       // Format: "LASTNAME, Firstname"
  designation: string;
  employeeType: EmployeeType;
  payFrequency: PayFrequency;
  dailyRate?: number;                 // for FIELD type
  monthlyRate?: number;               // for OFFICE type
  mealAllowance?: number;             // per day
  projectId?: string;                 // linked project
  dateHired: Date;
  isActive: boolean;
  sssNumber?: string;
  philhealthNumber?: string;
  pagibigNumber?: string;
  tinNumber?: string;
}

// Daily Time Record entry
export interface DTREntry {
  date: Date;
  dayType: DayType;                   // see enum below
  regularHours: number;               // standard = 8 hrs
  overtimeHours: number;
  nightDiffHours: number;             // 10PM–6AM hours
  isAbsent: boolean;
  tardinessMinutes: number;
}

export type DayType =
  | 'REGULAR'          // Normal workday
  | 'REST_DAY'         // Employee's rest day (Sunday)
  | 'SPECIAL_HOLIDAY'  // Special Non-Working Holiday (SNWH)
  | 'REGULAR_HOLIDAY'  // Regular Holiday (New Year, Christmas, etc.)
  | 'DOUBLE_HOLIDAY';  // Two regular holidays coincide

// Payroll Run (one cut-off period)
export interface PayrollRun {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  payDate: Date;
  status: 'DRAFT' | 'APPROVED' | 'PAID';
  createdBy: string;
  createdAt: Date;
}

// Computed payslip for one employee in one run
export interface Payslip {
  id: string;
  payrollRunId: string;
  employee: Employee;

  // Attendance
  workingDays: number;
  regularHours: number;
  overtimeHours: number;
  nightDiffHours: number;

  // Earnings
  basicPay: number;
  mealAllowance: number;
  otPayRegular: number;
  otPayRestDay: number;               // OT on Rest Day / SNWH
  otPayRegularHoliday: number;
  regularHolidayPay: number;         // Holiday pay even if absent
  specialHolidayPay: number;
  nightDifferential: number;
  deMinimisBenefits: number;          // Non-taxable (max ₱10,000/mo)
  otherBenefitsNonTax: number;
  thirteenthMonthPay: number;        // Accrued portion
  adjustment: number;                 // Manual +/- adjustment
  commission: number;

  // Deductions — Employee Share
  empSSS: number;
  empPhilhealth: number;
  empPagibig: number;
  withholdingTax: number;
  tardinessDeduction: number;
  otherDeduction: number;

  // Employer Share (for records)
  erSSS: number;
  erPhilhealth: number;
  erPagibig: number;

  // Totals
  grossPay: number;                   // sum of all earnings
  totalDeductions: number;
  netPay: number;

  remarks?: string;
}
```

---

## ⚙️ PAYROLL ENGINE — `src/utils/payrollEngine.ts`

Implement all computations according to Philippine Labor Code and DOLE guidelines.

### 1. Basic Pay

```typescript
// FIELD WORKER (daily rate)
basicPay = dailyRate * workingDays;

// OFFICE STAFF (monthly rate, semi-monthly)
basicPay = monthlyRate / 2;   // per cut-off
```

### 2. Overtime Pay Rates (PH Labor Code)

```typescript
// Hourly rate from daily rate
const hourlyRate = dailyRate / 8;

// OT on Regular Day: +25% of hourly rate
otRegular = overtimeHours * hourlyRate * 1.25;

// OT on Rest Day or Special Non-Working Holiday:
// Base = dailyRate * 1.30; Hourly OT = (base/8) * 1.30
otRestDay = overtimeHours * (dailyRate / 8) * 1.30 * 1.30;

// OT on Regular Holiday:
// Base = dailyRate * 2.00; Hourly OT = (base/8) * 1.30
otRegularHoliday = overtimeHours * (dailyRate / 8) * 2.00 * 1.30;

// OT on Double Holiday:
// Base = dailyRate * 3.00; Hourly OT = (base/8) * 1.30
otDoubleHoliday = overtimeHours * (dailyRate / 8) * 3.00 * 1.30;
```

### 3. Holiday Pay (even if not worked)

```typescript
// Regular Holiday — employee gets 100% pay even if absent
regularHolidayPay = dailyRate * 1.00;

// Worked on Regular Holiday: 200% of daily rate
workedHolidayPay = dailyRate * 2.00;

// Special Non-Working Holiday — no work no pay
// If worked: +30% of daily rate
specialHolidayPay = dailyRate * 1.30;
```

### 4. Night Differential

```typescript
// Night Diff applies to hours worked between 10PM and 6AM
// Premium: +10% of regular hourly rate
nightDiff = nightDiffHours * (dailyRate / 8) * 0.10;
```

### 5. Tardiness Deduction

```typescript
// Deduction = (dailyRate / 8 / 60) * tardinessMinutes
tardinessDeduction = (dailyRate / 8 / 60) * totalTardinessMinutes;
```

---

## 🏛️ GOVERNMENT CONTRIBUTIONS — `src/utils/governmentContrib.ts`

### SSS (2025 rates — R.A. 11199)

```typescript
// Monthly Salary Credit (MSC) table: ₱4,000 to ₱30,000
// Employee share: 4.5% of MSC
// Employer share: 8.5% of MSC + EC (₱10 or ₱30)

// For weekly/semi-monthly payroll, divide monthly contribution by frequency
// SSS contribution is computed MONTHLY, hold per cut-off, remit monthly

function computeSSS(monthlyBasicPay: number): { employee: number; employer: number } {
  // Use official SSS contribution table
  // MSC floor: ₱4,000, ceiling: ₱30,000
  const msc = Math.min(Math.max(Math.round(monthlyBasicPay / 500) * 500, 4000), 30000);
  const employee = msc * 0.045;
  const employer = msc * 0.085;
  return { employee, employer };
}
```

**SSS Table Breakpoints (simplified, implement full table):**

| Monthly Salary Range | MSC | Employee | Employer |
|---|---|---|---|
| Below ₱4,250 | ₱4,000 | ₱180.00 | ₱340.00 |
| ₱4,250–₱4,749.99 | ₱4,500 | ₱202.50 | ₱382.50 |
| ... (continue per SSS table) | | | |
| ₱29,750 and above | ₱30,000 | ₱1,350.00 | ₱2,550.00 |

> ⚠️ Agent: Implement the full SSS contribution table from the official SSS circular. Store as a lookup array `SSS_TABLE: { min: number, max: number, msc: number }[]`.

### PhilHealth (2025 — PhilHealth Circular 2023-0014)

```typescript
// Premium Rate: 5% of Basic Monthly Salary
// Shared equally: 2.5% employee + 2.5% employer
// Minimum: ₱500/month (salary ≤ ₱10,000)
// Maximum: ₱5,000/month (salary ≥ ₱100,000)

function computePhilhealth(monthlyBasicPay: number): { employee: number; employer: number } {
  const premium = Math.min(Math.max(monthlyBasicPay * 0.05, 500), 5000);
  return { employee: premium / 2, employer: premium / 2 };
}
```

### Pag-IBIG (HDMF)

```typescript
// Employee: 1% if salary ≤ ₱1,500; 2% if > ₱1,500 (max ₱100/month)
// Employer: 2% (max ₱100/month)

function computePagibig(monthlyBasicPay: number): { employee: number; employer: number } {
  const empRate = monthlyBasicPay <= 1500 ? 0.01 : 0.02;
  const employee = Math.min(monthlyBasicPay * empRate, 100);
  const employer = Math.min(monthlyBasicPay * 0.02, 100);
  return { employee, employer };
}
```

---

## 💸 WITHHOLDING TAX — `src/utils/taxTable.ts`

Based on **TRAIN Law (R.A. 10963)** — revised BIR tax table effective 2023:

```typescript
// Annual taxable income brackets (2023 onward)
// Taxable Income = Gross Income - Non-taxable benefits - Government contributions

const TAX_TABLE = [
  { min: 0,         max: 250000,    base: 0,       rate: 0    },
  { min: 250001,    max: 400000,    base: 0,       rate: 0.15 },
  { min: 400001,    max: 800000,    base: 22500,   rate: 0.20 },
  { min: 800001,    max: 2000000,   base: 102500,  rate: 0.25 },
  { min: 2000001,   max: 8000000,   base: 402500,  rate: 0.30 },
  { min: 8000001,   max: Infinity,  base: 2202500, rate: 0.35 },
];

// Non-taxable limits (per TRAIN Law):
// De Minimis: ₱10,000/month (₱120,000/year) — rice, uniform, laundry, etc.
// 13th Month + Other Benefits: ₱90,000/year
// SSS + PhilHealth + Pag-IBIG (employee share): fully deductible

function computeWithholdingTax(annualTaxableIncome: number): number {
  const bracket = TAX_TABLE.find(b => annualTaxableIncome >= b.min && annualTaxableIncome <= b.max);
  if (!bracket) return 0;
  return bracket.base + ((annualTaxableIncome - bracket.min) * bracket.rate);
}

// Convert annual tax to per-payroll-period tax:
// Monthly: annualTax / 12
// Semi-monthly: annualTax / 24
// Weekly: annualTax / 52
```

---

## 📅 PH HOLIDAYS — `src/data/phHolidays.ts`

```typescript
export type HolidayType = 'REGULAR' | 'SPECIAL';

export interface PHHoliday {
  date: string;   // ISO format: "2026-01-01"
  name: string;
  type: HolidayType;
}

export const PH_HOLIDAYS_2026: PHHoliday[] = [
  { date: "2026-01-01", name: "New Year's Day", type: "REGULAR" },
  { date: "2026-04-02", name: "Maundy Thursday", type: "REGULAR" },
  { date: "2026-04-03", name: "Good Friday", type: "REGULAR" },
  { date: "2026-04-04", name: "Black Saturday", type: "SPECIAL" },
  { date: "2026-04-09", name: "Araw ng Kagitingan", type: "REGULAR" },
  { date: "2026-05-01", name: "Labor Day", type: "REGULAR" },
  { date: "2026-06-12", name: "Independence Day", type: "REGULAR" },
  { date: "2026-08-31", name: "National Heroes Day", type: "REGULAR" },
  { date: "2026-11-01", name: "All Saints Day", type: "SPECIAL" },
  { date: "2026-11-02", name: "All Souls Day", type: "SPECIAL" },
  { date: "2026-11-30", name: "Bonifacio Day", type: "REGULAR" },
  { date: "2026-12-08", name: "Immaculate Conception", type: "SPECIAL" },
  { date: "2026-12-24", name: "Christmas Eve", type: "SPECIAL" },
  { date: "2026-12-25", name: "Christmas Day", type: "REGULAR" },
  { date: "2026-12-30", name: "Rizal Day", type: "REGULAR" },
  { date: "2026-12-31", name: "New Year's Eve", type: "SPECIAL" },
  // Add local holidays as needed
];
```

---

## 🖥️ UI COMPONENTS

### PayrollDashboard.tsx
KPI cards showing:
- Total employees on payroll this period
- Total gross payroll amount
- Total government remittances due (SSS + PhilHealth + Pag-IBIG)
- Total net pay disbursed
- Payroll cost breakdown chart (pie: basic pay, OT, allowances, deductions)

### PayrollRegister.tsx
Table columns:
`Period | # Employees | Gross Pay | Total Deductions | Net Pay | Status | Actions`

Status chips: DRAFT (grey) | APPROVED (blue) | PAID (green)

### PayrollRunForm.tsx
Step-by-step wizard:
1. **Step 1 — Period Setup**: Select period start/end date, pay date, filter by project or all employees
2. **Step 2 — DTR Entry**: Per-employee table with editable: working days, regular hrs, OT hrs, night diff hrs, tardiness, day types
3. **Step 3 — Preview & Adjustments**: Review computed payslips, allow manual adjustment field per employee
4. **Step 4 — Approve & Lock**: Summary, approve button locks the run

### PayslipCard.tsx
- Matches CMR Philippines payslip layout exactly (see reference images)
- Show IOCT logo + branding (blue #2853c0, charcoal #2c3242)
- Fields: Employee No., Name, Designation, Rate, Meal Allowance, Period, Days, Hours, OT Hrs
- Earnings column + Deductions column
- Sub-Total row, Net Pay row
- Signature / Date / Remarks rows
- Print button triggers `window.print()` with print-specific CSS (hide nav, show only payslip)
- Download as PDF option

### GovernmentContribTable.tsx
Monthly government remittance summary:
- Group by SSS / PhilHealth / Pag-IBIG
- Columns: Employee Name, Employee Share, Employer Share, Total
- Export to Excel button

---

## 🗄️ DATABASE — Firebase Firestore

Use **Firestore** (not Realtime Database). Structure as top-level collections.

### Firestore Collections

```
/employees/{employeeId}
  employeeNumber: string
  name: string                  // "LASTNAME, Firstname"
  designation: string
  employeeType: "FIELD" | "OFFICE"
  payFrequency: "WEEKLY" | "SEMI_MONTHLY" | "MONTHLY"
  dailyRate: number             // FIELD only
  monthlyRate: number           // OFFICE only
  mealAllowance: number
  dateHired: Timestamp
  isActive: boolean
  sssNumber: string
  philhealthNumber: string
  pagibigNumber: string
  tinNumber: string
  createdAt: Timestamp

/payrollRuns/{runId}
  periodStart: Timestamp
  periodEnd: Timestamp
  payDate: Timestamp
  status: "DRAFT" | "APPROVED" | "PAID"
  createdBy: string             // uid of creator
  createdAt: Timestamp

/payrollRuns/{runId}/dtrEntries/{entryId}    ← subcollection
  employeeId: string
  entryDate: Timestamp
  dayType: "REGULAR" | "REST_DAY" | "SPECIAL_HOLIDAY" | "REGULAR_HOLIDAY" | "DOUBLE_HOLIDAY"
  regularHours: number
  overtimeHours: number
  nightDiffHours: number
  isAbsent: boolean
  tardinessMinutes: number

/payrollRuns/{runId}/payslips/{employeeId}   ← subcollection
  employeeId: string
  employeeSnapshot: { ... }     // copy of employee data at time of run (immutable record)
  workingDays: number
  regularHours: number
  overtimeHours: number
  nightDiffHours: number
  // earnings
  basicPay: number
  mealAllowance: number
  otPayRegular: number
  otPayRestDay: number
  otPayRegularHoliday: number
  regularHolidayPay: number
  specialHolidayPay: number
  nightDifferential: number
  deMinimisBenefits: number
  otherBenefitsNonTax: number
  thirteenthMonthAccrual: number
  adjustment: number
  commission: number
  // deductions
  empSSS: number
  empPhilhealth: number
  empPagibig: number
  withholdingTax: number
  tardinessDeduction: number
  otherDeduction: number
  // employer share
  erSSS: number
  erPhilhealth: number
  erPagibig: number
  // totals
  grossPay: number
  totalDeductions: number
  netPay: number
  remarks: string
  computedAt: Timestamp

/phHolidays/{holidayId}
  holidayDate: string           // "YYYY-MM-DD"
  holidayName: string
  holidayType: "REGULAR" | "SPECIAL"
```

### Firebase Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper: check if user is a payroll-authorized user
    function isPayrollUser() {
      return request.auth != null &&
        (request.auth.token.role == 'TJC' || request.auth.token.role == 'RJR');
    }

    // All payroll collections — restricted to TJC and RJR only
    match /employees/{id} {
      allow read, write: if isPayrollUser();
    }
    match /payrollRuns/{runId} {
      allow read, write: if isPayrollUser();
      match /dtrEntries/{entryId} {
        allow read, write: if isPayrollUser();
      }
      match /payslips/{empId} {
        allow read, write: if isPayrollUser();
      }
    }
    match /phHolidays/{id} {
      allow read: if request.auth != null;   // all logged-in users can read holidays
      allow write: if isPayrollUser();
    }
  }
}
```

> ⚠️ Agent note: The `role` custom claim (`TJC` or `RJR`) must be set server-side via Firebase Admin SDK when the user account is provisioned. Add a one-time script `scripts/setPayrollRoles.js` that sets `{ role: 'TJC' }` for Tyrone's UID and `{ role: 'RJR' }` for Reuel's UID.

### Firebase Service Layer — `src/utils/firebasePayroll.ts`

Create typed Firestore helper functions wrapping `firebase/firestore` SDK calls. Example pattern:

```typescript
import { collection, addDoc, getDocs, doc, setDoc, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';  // existing firebase init

// Employees
export const getEmployees = async (): Promise<Employee[]> => { ... }
export const upsertEmployee = async (emp: Employee): Promise<void> => { ... }

// Payroll Runs
export const createPayrollRun = async (run: Omit<PayrollRun, 'id'>): Promise<string> => { ... }
export const getPayrollRuns = async (): Promise<PayrollRun[]> => { ... }
export const approvePayrollRun = async (runId: string): Promise<void> => { ... }

// DTR
export const saveDTREntries = async (runId: string, entries: DTREntry[]): Promise<void> => { ... }
export const getDTREntries = async (runId: string): Promise<DTREntry[]> => { ... }

// Payslips
export const savePayslip = async (runId: string, payslip: Payslip): Promise<void> => { ... }
export const getPayslipsForRun = async (runId: string): Promise<Payslip[]> => { ... }
```

---

## 🔐 ACCESS CONTROL — Payroll Page Guard

The Payroll module is **only accessible to two users**: TJC (Tyrone) and RJR (Reuel).

### User Role Config — `src/config/payrollAccess.ts`

```typescript
// Authorized payroll users by Firebase UID or email
// Agent: populate these with the actual Firebase UIDs after account lookup
export const PAYROLL_AUTHORIZED_UIDS: string[] = [
  'UID_OF_TJC',   // Tyrone — replace with actual Firebase UID
  'UID_OF_RJR',   // Reuel  — replace with actual Firebase UID
];

export const isPayrollAuthorized = (uid: string | undefined): boolean => {
  if (!uid) return false;
  return PAYROLL_AUTHORIZED_UIDS.includes(uid);
};
```

### Route Guard — `src/components/payroll/PayrollGuard.tsx`

```typescript
import { useAuthContext } from '../../contexts/AuthContext';
import { isPayrollAuthorized } from '../../config/payrollAccess';

const PayrollGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthContext();

  if (!isPayrollAuthorized(user?.uid)) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <LockIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
        <Typography variant="h6" color="text.secondary" mt={2}>
          Access Restricted
        </Typography>
        <Typography variant="body2" color="text.disabled">
          You don't have permission to view Payroll.
        </Typography>
      </Box>
    );
  }

  return <>{children}</>;
};
```

### Nav Item — hide the Payroll nav item for unauthorized users

```typescript
// In ProjectMonitoringApp.tsx navigation
const { user } = useAuthContext();

// Only render Payroll nav item if user is authorized
{isPayrollAuthorized(user?.uid) && (
  <NavItem icon={<PaymentsIcon />} label="Payroll" view="payroll" />
)}
```

### Wrap the entire Payroll module

```typescript
// In the main app router/view switcher
{currentView === 'payroll' && (
  <PayrollGuard>
    <PayrollDashboard />
  </PayrollGuard>
)}
```

---

## 🔌 FIREBASE FUNCTIONS (optional — for server-side ops)

No Express API needed since Firestore rules handle security. All operations go directly through the Firestore SDK from the client. If heavy server-side computation is needed (e.g., batch payroll computation for 50+ employees), use a **Firebase Cloud Function**:

```typescript
// functions/src/computePayroll.ts
export const computePayrollRun = functions.https.onCall(async (data, context) => {
  // Verify caller is authorized
  if (!context.auth || !['TJC', 'RJR'].includes(context.auth.token.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Unauthorized');
  }
  const { runId } = data;
  // Pull DTR entries, compute all payslips, write back to Firestore
  // ... computation logic (same as payrollEngine.ts)
});
```

For MVP, client-side computation in `payrollEngine.ts` is sufficient.

---

## 🧭 NAVIGATION INTEGRATION

In the existing `ProjectMonitoringApp.tsx`, add **"Payroll"** as a new top-level nav item alongside "Dashboard" and "Projects."

```typescript
// Navigation items
type AppView = 'dashboard' | 'projects' | 'payroll';

// Add to nav:
<NavItem icon={<PaymentsIcon />} label="Payroll" view="payroll" />

// Route to PayrollDashboard when view === 'payroll'
```

---

## 🎨 UI/UX GUIDELINES

Match existing MUI v5 theming with IOCT brand:
- Primary: `#2853c0`
- Dark/Header: `#2c3242`
- Payslip accent: use a subtle blue-grey for section separators

**Payslip Print CSS:**
```css
@media print {
  body * { visibility: hidden; }
  .payslip-print-area, .payslip-print-area * { visibility: visible; }
  .payslip-print-area { position: absolute; left: 0; top: 0; width: 100%; }
  nav, .MuiDrawer-root { display: none !important; }
}
```

---

## 📋 IMPLEMENTATION ORDER (for the agent)

Work in this sequence to avoid blockers:

1. **Types** — Create `src/types/Payroll.ts` with all interfaces
2. **Utils** — Create computation engines (payrollEngine, governmentContrib, taxTable, holidayUtils)
3. **Data** — Seed `phHolidays.ts` with 2026 holidays
4. **Firebase Setup** — Add Firestore collections, write `firebasePayroll.ts` service layer
5. **Security Rules** — Update `firestore.rules` with payroll collection restrictions
6. **Access Control** — Create `payrollAccess.ts` config and `PayrollGuard.tsx` component
7. **Set UIDs** — Run `scripts/setPayrollRoles.js` to assign TJC/RJR roles via Firebase Admin
8. **Employee Management UI** — CRUD for employees before you can run payroll
9. **Payroll Run Wizard** — PayrollRunForm with DTR entry
10. **Payslip Display** — PayslipCard with print layout
11. **Dashboard** — PayrollDashboard with KPIs
12. **Gov Remittance Summary** — GovernmentContribTable with export
13. **Nav Integration** — Add Payroll nav item (hidden for non-authorized users)

---

## ✅ ACCEPTANCE CRITERIA

- [ ] Payroll nav item is **invisible** to users who are not TJC or RJR
- [ ] Attempting to navigate to `/payroll` directly shows "Access Restricted" for unauthorized users
- [ ] TJC and RJR can access the full Payroll module after login
- [ ] Can create an employee (field or office type) with government numbers — stored in Firestore
- [ ] Can create a payroll run for a date range
- [ ] Can input DTR (regular hrs, OT, night diff, absences, tardiness, day types)
- [ ] System auto-computes: basic pay, all OT premiums, holiday pay, night diff
- [ ] System auto-computes: SSS, PhilHealth, Pag-IBIG (employee + employer), withholding tax
- [ ] Manual adjustment field per employee (positive or negative)
- [ ] Payroll run can be approved (locks all figures — Firestore doc becomes read-only via rules)
- [ ] Individual payslip renders correctly and matches CMR format
- [ ] Payslip is printable with clean print layout (no nav, no sidebars)
- [ ] Monthly government remittance report is exportable
- [ ] Philippine holidays (regular and special) are correctly classified in OT rate computation
- [ ] All Firestore writes are rejected for non-TJC/RJR users via security rules

---

## 📎 REFERENCE PAYSLIP ANALYSIS

### Field Worker Payslip (Norman Gomez — HELPER)
| Field | Value | Formula |
|---|---|---|
| Daily Rate | ₱700 | — |
| Meal Allowance | ₱100/day | — |
| Period | Jan 19–25, 2026 | 6 working days |
| Basic Pay | ₱4,200 | 700 × 6 |
| Meal Allowance | ₱600 | 100 × 6 |
| OT Pay (Regular) | ₱1,203.13 | 11 OT hrs × (700/8) × 1.25 |
| Adjustment | ₱150 | Manual |
| SSS | ₱212.50 | Monthly portion |
| PhilHealth | ₱106.25 | Monthly portion |
| Pag-IBIG | ₱50.00 | Monthly max cap |
| **Net Pay** | **₱5,784.38** | 6,153.13 − 368.75 |

### Office Staff Payslip (Renzel Punongbayan — Engineering Manager)
| Field | Value |
|---|---|
| Basic Salary | ₱30,305.52/month |
| De Minimis | ₱3,000 |
| Other Non-Tax Benefits | ₱1,665.28 |
| Withholding Tax | ₱1,048.48 |
| SSS | ₱1,525.00 |
| PhilHealth | ₱757.64 |
| Pag-IBIG | ₱200.00 |
| **Net Pay** | **₱31,439.68** |
| Released | 2 tranches: 15th + 30th |

---

*Generated for IOCT pmv2 — IO Control Technologie OPC*  
*Reference: PH Labor Code, TRAIN Law, SSS Circular 2023-002, PhilHealth Circular 2023-0014, DOLE Department Orders*
