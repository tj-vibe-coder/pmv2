# pmv2 — Data Model Reference

Covers Firestore collections, TypeScript interfaces, LocalStorage keys, and entity relationships.

---

## 1. Entity Relationship Overview

```
users ──┐                     (cash_advances.user_id → users.id)
         ├── owns → cash_advances
         ├── owns → liquidations
         └── creates → payrollRuns

clients ──┐                   (projects.client_id → clients.id)
          └── referenced_by → projects

projects ──┬── has → project_attachments      (project_attachments.project_id → projects.id)
           ├── can_be_linked_to → cash_advances (optional)
           └── referenceable → estimates/BOM

suppliers ──┐                  (supplier_products.supplier_id → suppliers.id)
            └── has → supplier_products

payrollRuns ─┐
             ├── has → dtrEntries (subcollection)
             └── has → payslips   (subcollection, 1 per employee)

employees ── standalone collection, linked to payrollRuns via employeeId in payslips
phHolidays ── standalone collection
```

---

## 2. Firestore Collections

### 2.1 `users`

**Document ID:** Auto-generated (`abc123`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `username` | string | Yes | Unique, login identifier |
| `email` | string | Yes | |
| `password_hash` | string | Yes | base64 of plaintext — **not secure**, legacy |
| `role` | string | Yes | `"superadmin"` \| `"admin"` \| `"user"` \| `"viewer"` |
| `approved` | number | Yes | `0` = pending, `1` = approved |
| `full_name` | string\|null | No | |
| `designation` | string\|null | No | |
| `created_at` | number | Yes | Unix seconds |
| `updated_at` | number | Yes | Unix seconds |

**Default users** (created on server startup via `server.js:createDefaultUsers()`):

Default user passwords are loaded from environment variables
(`DEFAULT_USER_PASSWORD_<USERNAME>`) and intentionally not documented here.
The seed only runs for users whose password env var is set; in production,
prefer creating accounts via the admin UI and skip seeding entirely.

| Username | Email | Role |
|---|---|---|
| `TJC` | (configured per deployment) | superadmin |
| `admin` | (configured per deployment) | admin |
| `user` | (configured per deployment) | user |
| `projects` | (configured per deployment) | admin |

### 2.2 `projects`

**Document ID:** Auto-generated

60+ fields covering financial tracking, scheduling, and progress monitoring.

**Identifier fields:**
| Field | Type | Example |
|---|---|---|
| `item_no` | number | `1` |
| `year` | number | `2026` |
| `project_no` | string (may not exist in all docs) | `"P-2026-001"` |
| `ovp_number` | string | `"OVP-2026-001"` |
| `po_number` | string | `"PO-2026-001"` |
| `qtn_no` | string | `"QTN-001"` |
| `project_name` | string | `"CLARKTEL PAMPANGA"` |

**Client/party fields:**
| Field | Type | Notes |
|---|---|---|
| `account_name` | string | Resolved from `clients` if `client_id` set |
| `client_id` | number\|null | Foreign key to `clients` document ID |
| `client_status` | string | |
| `client_approver` | string | Auto-built: `"contact_person – designation"` |
| `project_director` | string | |
| `am` | string | Account manager |

**Financial fields:**
| Field | Type | Notes |
|---|---|---|
| `contract_amount` | number | Original contract value |
| `updated_contract_amount` | number | Current contract value (used for KPIs) |
| `down_payment_percent` | number | |
| `retention_percent` | number | |
| `contract_billed` | number | Gross billed |
| `contract_billed_gross_percent` | number | |
| `amount_contract_billed_net` | number | Net billed amount |
| `contract_billed_net_percent` | number | |
| `total_contract_balance` | number | |
| `updated_contract_balance_net` | number | Outstanding balance |
| `updated_contract_balance_net_percent` | number | |
| `for_retention_billing_percent` | number | |
| `amount_for_retention_billing` | number | |
| `retention_status` | string | |
| `for_rfb_percent` | number | RFB = Request for Billing |
| `for_rfb_amount` | number | |
| `unevaluated_progress` | number | |

**Schedule fields:**
| Field | Type | Format |
|---|---|---|
| `start_date` | number\|null | Unix seconds |
| `completion_date` | number\|null | Unix seconds |
| `mobilization_date` | number\|null | Unix seconds |
| `updated_completion_date` | number\|null | Unix seconds |
| `duration_days` | number | |
| `payment_schedule` | string | |
| `payment_terms` | string | |
| `progress_billing_schedule` | string | |
| `bonds_requirement` | string | |

**Progress fields:**
| Field | Type | Notes |
|---|---|---|
| `project_status` | string | `"OPEN"`, `"CLOSED"`, `"FOR_CLOSEOUT"`, `"PENDING"`, `"CANCELLED"`, etc. |
| `project_category` | string | |
| `project_location` | string | |
| `scope_of_work` | string | |
| `actual_site_progress_percent` | number | |
| `actual_progress` | number | |
| `evaluated_progress_percent` | number | |
| `evaluated_progress` | number | |
| `work_in_progress_ap` | number | |
| `work_in_progress_ep` | number | |
| `type_of_rfb` | string | |
| `rfb_date` | number\|null | Unix seconds |
| `remarks` | string | |
| `ovp_category` | string | |

**Audit fields:**
| Field | Type | Format |
|---|---|---|
| `created_at` | string | ISO 8601 |
| `updated_at` | string | ISO 8601 |

**Notes:**
- `po_date` is a Unix timestamp (number), not an ISO string
- Financial calculations use `updated_contract_amount` as primary; fallback to `contract_amount`
- `getUnbilled()` in dataService = `max(0, updated_contract_amount - amount_contract_billed_net)`

### 2.3 `clients`

**Document ID:** Auto-generated

| Field | Type | Required |
|---|---|---|
| `client_name` | string | Yes |
| `address` | string | No |
| `payment_terms` | string | No |
| `contact_person` | string | No |
| `designation` | string | No |
| `email_address` | string | No |
| `created_at` | string (ISO) | Auto |
| `updated_at` | string (ISO) | Auto |

**Relationships:**
- Projects link to clients via `projects.client_id`
- When client name/approver changes, ALL linked projects are batch-updated (see `PUT /api/clients/:id`)

### 2.4 `cash_advances`

**Document ID:** Auto-generated

| Field | Type | Default | Notes |
|---|---|---|---|
| `user_id` | string | — | Creator's user ID |
| `amount` | number | — | Total amount |
| `balance_remaining` | number | `amount` | Decremented by liquidations |
| `status` | string | `"pending"` | `"pending"` \| `"approved"` \| `"rejected"` |
| `purpose` | string\|null | `null` | |
| `breakdown` | array\|null | `null` | `[{ category, description, amount }]` |
| `project_id` | string\|null | `null` | Optional link to project |
| `requested_at` | number | now | Unix seconds |
| `approved_at` | number\|null | `null` | Unix seconds |
| `approved_by` | string\|null | `null` | Admin's user ID |
| `created_at` | number | now | Unix seconds |
| `updated_at` | number | now | Unix seconds |

**Balance tracking flow:**
```
create CA          → balance_remaining = amount
approve CA         → status = "approved", balance_remaining unchanged
submit liquidation → balance_remaining -= liquidation.total_amount
delete liquidation → balance_remaining += liquidation.total_amount
```

### 2.5 `liquidations`

**Document ID:** Auto-generated

| Field | Type | Notes |
|---|---|---|
| `user_id` | string | Creator's user ID |
| `form_no` | string\|null | `"LQ-0001"` format |
| `date_of_submission` | string\|null | |
| `employee_name` | string\|null | |
| `employee_number` | string\|null | |
| `rows_json` | string | JSON-encoded array of line items |
| `total_amount` | number | |
| `ca_id` | string\|null | Linked cash advance |
| `status` | string | `"draft"` \| `"submitted"` |
| `created_at` | number | Unix seconds |
| `updated_at` | number | Unix seconds |

**Form numbering:** Auto-generated sequence `LQ-XXXX` via `GET /api/liquidations/next-form-no`, computed from existing submitted liquidations.

### 2.6 `suppliers`

**Document ID:** User-provided (same `id` used in client and server)

| Field | Type | Notes |
|---|---|---|
| `name` | string | |
| `contact_name` | string\|null | |
| `email` | string\|null | |
| `phone` | string\|null | |
| `address` | string\|null | |
| `payment_terms` | string\|null | |
| `created_at` | string (ISO) | |

### 2.7 `supplier_products`

**Document ID:** User-provided

| Field | Type | Notes |
|---|---|---|
| `supplier_id` | string | FK to `suppliers.id` |
| `name` | string\|null | Product name |
| `part_no` | string\|null | Part number |
| `description` | string\|null | |
| `brand` | string\|null | |
| `unit` | string | Default: `"pcs"` |
| `unit_price` | number\|null | |
| `price_date` | string\|null | |

**⚠️ Important:** `POST /api/suppliers` is a **bulk replace** operation. It deletes ALL documents from both `suppliers` and `supplier_products`, then re-inserts everything. There is no incremental PATCH support.

### 2.8 `project_attachments`

**Document ID:** Auto-generated

| Field | Type | Notes |
|---|---|---|
| `project_id` | string | FK |
| `filename` | string | |
| `onedrive_item_id` | string | OneDrive file ID |
| `onedrive_web_url` | string\|null | Link to file in OneDrive |
| `file_size` | number\|null | Bytes |
| `uploaded_by` | string\|null | User ID |
| `created_at` | string (ISO) | |

### 2.9 `employees` (Payroll)

**Document ID:** Auto-generated

| Field | Type | Notes |
|---|---|---|
| `employeeNumber` | string | Employee ID |
| `name` | string | `"LASTNAME, Firstname"` |
| `designation` | string | Job title |
| `employeeType` | string | `"FIELD"` \| `"OFFICE"` |
| `payFrequency` | string | `"WEEKLY"` \| `"SEMI_MONTHLY"` \| `"MONTHLY"` |
| `dailyRate` | number\|undefined | FIELD only |
| `monthlyRate` | number\|undefined | OFFICE only |
| `mealAllowance` | number\|undefined | Per day |
| `projectId` | string\|undefined | Linked project |
| `dateHired` | string | ISO date |
| `isActive` | boolean | |
| `sssNumber` | string\|undefined | |
| `philhealthNumber` | string\|undefined | |
| `pagibigNumber` | string\|undefined | |
| `tinNumber` | string\|undefined | |
| `createdAt` | string\|undefined | ISO date |

### 2.10 `payrollRuns`

**Document ID:** Auto-generated

| Field | Type | Notes |
|---|---|---|
| `periodStart` | string (ISO) | Payroll period start |
| `periodEnd` | string (ISO) | Payroll period end |
| `payDate` | string (ISO) | Date of disbursement |
| `status` | string | `"DRAFT"` \| `"APPROVED"` \| `"PAID"` |
| `createdBy` | string | User ID |
| `createdAt` | string (ISO) | |

**Subcollections:**
- `/payrollRuns/{runId}/dtrEntries/{entryId}` — DTR entries per employee per day
- `/payrollRuns/{runId}/payslips/{employeeId}` — Computed payslip per employee

### 2.11 `dtrEntries` (subcollection)

| Field | Type | Notes |
|---|---|---|
| `employeeId` | string | |
| `entryDate` | string (ISO) | Shift date |
| `dayType` | string | `"REGULAR"` \| `"REST_DAY"` \| `"SPECIAL_HOLIDAY"` \| `"REGULAR_HOLIDAY"` \| `"DOUBLE_HOLIDAY"` |
| `regularHours` | number | |
| `overtimeHours` | number | |
| `nightDiffHours` | number | Hours between 10PM–6AM |
| `isAbsent` | boolean | |
| `tardinessMinutes` | number | |

### 2.12 `payslips` (subcollection)

See `src/types/Payroll.ts::Payslip` for all fields. Key structure:

**Document ID:** `employeeId` (one payslip per employee per run)

**Earnings:** `basicPay`, `mealAllowance`, `otPayRegular`, `otPayRestDay`, `otPayRegularHoliday`, `regularHolidayPay`, `specialHolidayPay`, `nightDifferential`, `deMinimisBenefits`, `otherBenefitsNonTax`, `thirteenthMonthAccrual`, `adjustment`, `commission`

**Deductions:** `empSSS`, `empPhilhealth`, `empPagibig`, `withholdingTax`, `tardinessDeduction`, `otherDeduction`

**Employer share:** `erSSS`, `erPhilhealth`, `erPagibig`

**Totals:** `grossPay`, `totalDeductions`, `netPay`

**Includes:** `employeeSnapshot` — a copy of the employee document at time of computation (immutable record).

### 2.13 `phHolidays`

| Field | Type | Notes |
|---|---|---|
| `holidayDate` | string | `"YYYY-MM-DD"` |
| `holidayName` | string | `"New Year's Day"` |
| `holidayType` | string | `"REGULAR"` \| `"SPECIAL"` |

Also has a static TypeScript source: `src/data/phHolidays.ts` (2026 holidays). The Firestore collection may be used for dynamic additions.

---

## 3. TypeScript Interfaces

### 3.1 `src/types/Project.ts`

```typescript
interface Project {
  id: number;                          // Numeric in TS, string in Firestore docs
  project_no?: string;
  item_no: number;
  year: number;
  am: string;                          // Account manager
  ovp_number: string;
  po_number: string;
  po_date: number | null;              // Unix seconds
  client_status: string;
  client_id?: number | null;
  account_name: string;
  project_name: string;
  project_category: string;
  project_location: string;
  scope_of_work: string;
  qtn_no: string;
  ovp_category: string;
  contract_amount: number;
  updated_contract_amount: number;     // Primary KPI value
  down_payment_percent: number;
  retention_percent: number;
  start_date: number | null;           // Unix seconds
  duration_days: number;
  completion_date: number | null;
  payment_schedule: string;
  payment_terms: string;
  bonds_requirement: string;
  project_director: string;
  client_approver: string;
  progress_billing_schedule: string;
  mobilization_date: number | null;
  updated_completion_date: number | null;
  project_status: string;              // "OPEN" | "CLOSED" | ...
  actual_site_progress_percent: number;
  actual_progress: number;
  evaluated_progress_percent: number;
  evaluated_progress: number;
  for_rfb_percent: number;
  for_rfb_amount: number;
  rfb_date: number | null;
  type_of_rfb: string;
  work_in_progress_ap: number;
  work_in_progress_ep: number;
  updated_contract_balance_percent: number;
  total_contract_balance: number;
  updated_contract_balance_net_percent: number;
  updated_contract_balance_net: number;
  remarks: string;
  contract_billed_gross_percent: number;
  contract_billed: number;
  contract_billed_net_percent: number;
  amount_contract_billed_net: number;
  for_retention_billing_percent: number;
  amount_for_retention_billing: number;
  retention_status: string;
  unevaluated_progress: number;
  created_at: string;                  // ISO string in Firestore
  updated_at: string;
}
```

### 3.2 `src/types/User.ts`

```typescript
interface User {
  id: number;                          // Numeric in TS, string in Firestore
  username: string;
  email: string;
  role: 'superadmin' | 'admin' | 'user' | 'viewer';
  approved?: number;                   // 0 or 1
  full_name?: string | null;
  designation?: string | null;
  created_at: number;                  // Unix seconds
  updated_at: number;
}
```

### 3.3 `src/types/Client.ts`

```typescript
interface Client {
  id: number;                          // Numeric in TS, string in Firestore
  client_name: string;
  address: string;
  payment_terms: string;
  contact_person: string;
  designation: string;
  email_address: string;
  created_at?: string;                 // ISO
  updated_at?: string;
}
```

### 3.4 `src/types/Payroll.ts`

See source file for all interfaces. Key types: `Employee`, `DTREntry`, `PayrollRun`, `Payslip`, `DTRInput`.

### 3.5 `src/types/Payroll.ts — Payslip`

Full breakdown of the most complex type:

```typescript
interface Payslip {
  employeeSnapshot: Employee;          // Immutable copy of employee at computation time
  workingDays: number;
  regularHours: number;
  overtimeHours: number;
  nightDiffHours: number;
  // Earnings
  basicPay: number;
  mealAllowance: number;
  otPayRegular: number;                // OT on regular day: OT hrs × (dailyRate/8) × 1.25
  otPayRestDay: number;                // OT on rest day: OT hrs × (dailyRate/8) × 1.30 × 1.30
  otPayRegularHoliday: number;         // OT on reg holiday: OT hrs × (dailyRate/8) × 2.00 × 1.30
  regularHolidayPay: number;           // Holiday pay even if absent: dailyRate × 1.00
  specialHolidayPay: number;           // If worked: dailyRate × 1.30
  nightDifferential: number;           // Night diff hours × (dailyRate/8) × 0.10
  deMinimisBenefits: number;           // Non-taxable, max ₱10,000/month
  otherBenefitsNonTax: number;
  thirteenthMonthAccrual: number;
  adjustment: number;                  // Manual +/- override
  commission: number;
  // Deductions
  empSSS: number;                      // MSC × 4.5%
  empPhilhealth: number;               // (monthly × 5%) / 2
  empPagibig: number;                  // 1% or 2%, max ₱100
  withholdingTax: number;              // TRAIN Law brackets
  tardinessDeduction: number;          // (dailyRate / 8 / 60) × tardinessMinutes
  otherDeduction: number;
  // Employer share
  erSSS: number;                       // MSC × 8.5%
  erPhilhealth: number;                // Same as employee share
  erPagibig: number;                   // 2%, max ₱100
  // Totals
  grossPay: number;
  totalDeductions: number;
  netPay: number;
}
```

---

## 4. LocalStorage Keys

| Key | Store | Format | Used By |
|---|---|---|---|
| `netpacific_token` | string | base64 `userId:username:timestamp` | AuthContext, all API calls |
| `netpacific_user` | string | JSON-encoded `User` object | AuthContext (cached) |
| `projectExpenses` | string | JSON array `[{projectId, amount}]` | Dashboard (budget tracking) |
| `projectBudgets` | string | JSON object `{projectId: budget}` | Dashboard (budget tracking) |

---

## 5. Computed Fields & Formulas

### 5.1 Project Dashboard KPIs

```
Backlogs (getUnbilled)  = max(0, updated_contract_amount - amount_contract_billed_net)
Total Contract Value    = sum(updated_contract_amount)
Total Billed Amount     = sum(amount_contract_billed_net)
Outstanding Balance     = Total Contract Value - Total Billed Amount
Completion Rate         = cumulativeBilled / cumulativeContracts × 100 (S-curve)
```

### 5.2 Payroll Computations

See `src/utils/payrollEngine.ts` and `PAYROLL_MODULE_INSTRUCTIONS.md` for full formulas.

```
FIELD basicPay          = dailyRate × workingDays
OFFICE basicPay         = monthlyRate / 2 (semi-monthly)

Hourly Rate             = dailyRate / 8

OT Regular              = OT hrs × hourlyRate × 1.25
OT Rest Day/SNWH        = OT hrs × hourlyRate × 1.30 × 1.30
OT Regular Holiday      = OT hrs × hourlyRate × 2.00 × 1.30

Holiday Pay (reg)       = dailyRate × 1.00 (even if absent)
Holiday Pay (worked)    = dailyRate × 2.00

Night Diff              = nightDiffHrs × hourlyRate × 0.10

Tardiness Deduction     = (dailyRate / 8 / 60) × tardinessMinutes

SSS                     = MSC bracket × 4.5% (emp) / 8.5% (er)
PhilHealth              = min(max(monthly × 5%, 500), 5000) / 2 each
Pag-IBIG                = min(monthly × rate, 100) each side
Withholding Tax         = TRAIN Law bracket computation on annualized taxable income
```

---

## 6. Data Migration Path

The project has undergone multiple data layers:

```
SQLite (database/projects.db)    ← Original, Node.js `better-sqlite3`
   └──→ Firestore (production)   ← Current, via Firebase Admin SDK
         └──→ Frontend via       ← Express API server (server.js)
              Express REST API
```

**Migration scripts** in `scripts/`:
- `migrate-excel-data.js` — Excel → SQLite
- `migrate-sqlite-to-firestore.js` — SQLite → Firestore
- `migrate-local-to-cloud.js` — Combined migration (SQLite → Firestore with schema setup)
- `setupDatabase.js` — SQLite schema initialization
- `validate-data-accuracy.js` — Post-migration data verification

The Express server hits **Firestore** directly now. The SQLite layer is legacy and only used by the standalone scripts.
