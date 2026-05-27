# pmv2 — IOCT Project Monitoring System Architecture

## 1. System Overview

pmv2 is a **split web application** — React frontend on Firebase Hosting (CDN) and Express API on Firebase Cloud Functions (2nd Gen, Node 22, us-central1).

**Deployment (current):** Firebase Hosting (React build) + Cloud Functions (Express API via `server.js`). Firebase Hosting rewrites `/api/**` → Cloud Function `api`; everything else → `index.html` (SPA).

**CI/CD:** GitHub Actions (`.github/workflows/deploy.yml`) — auto-deploys to Firebase on every push/merge to `main`. Manual dispatch available from the GitHub Actions tab with target selector (`all` / `hosting` / `functions`). `REACT_APP_*` env vars and `FIREBASE_TOKEN` stored as GitHub secrets.

**Branch workflow:** RJ works on `rj/dev`, never directly on `main`. Merging a PR from `rj/dev` → `main` triggers the auto-deploy. See `CLAUDE.md` instruction block #6 for per-session conflict-check steps.

### Modules

| Module | Purpose | Route |
|---|---|---|
| **Project Monitoring** | Dashboard, project CRUD, financial KPIs, charts | `/dashboard` |
| **Location Analysis** | Location-based project insights | `/location-analysis` |
| **Expense Management** | Cash Advances, Liquidations, Direct Labor | `/expense-monitoring/*` |
| **Clients** | Client database (linked to projects) | `/clients` |
| **Procurement / Supply Chain** | Material Requests, Orders, Delivery Receipts, Suppliers, Purchase Orders, Estimates | `/material-request`, `/delivery`, `/suppliers`, `/purchase-order`, `/estimates` |
| **Reports** | Progress Reports, Service Reports, Certificates of Completion, Attachments | `/reports/*` |
| **Utilities** | EHS docs (Safety Certificate, Manual, OSH Program), ID Generator, Acknowledgement Receipt | `/utilities/*` |
| **Payroll** | Employee management, payroll runs, payslip generation, government contributions | `/payroll` |
| **Admin / Settings** | User approvals, user database, account/role/password management | `/user-approvals`, `/settings/users` |
| **Investment Tracker** | Founder contributions & expenses | `/investment-tracker` |
| **Collections & AR** | Invoice tracking, due dates, collection status across all projects | `/collections` |

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| **Frontend framework** | React 19 + TypeScript 4.9 |
| **UI library** | MUI v5 (Material-UI) with `sx` prop styling |
| **Charts** | Recharts |
| **Routing** | React Router v7 |
| **Backend** | Express 5 + Firebase Admin SDK 13 |
| **Database** | Firebase Firestore (production), SQLite via `better-sqlite3` (legacy/local) |
| **Auth** | Custom auth — username/password via Express API + base64 tokens stored in `localStorage` (NOT Firebase Auth) |
| **File attachments** | OneDrive / Microsoft Graph API via MSAL browser SDK |
| **Build tool** | Create React App (react-scripts 5) |
| **Font/PDF** | jspdf, jspdf-autotable, pdf-lib, jsbarcode |
| **Spreadsheets** | xlsx (SheetJS) |
| **Deployment** | Firebase Hosting (React) + Cloud Functions 2nd Gen Node 22 (API) |
| **CI/CD** | GitHub Actions — auto-deploy on push to `main` |
| **Design system** | See `docs/DESIGN_PHILOSOPHY.md` — mandatory reading before creating/modifying pages |

---

## 3. Directory Layout

```
pmv2/
├── ARCHITECTURE.md                  # ← this file
├── CLAUDE_CODE_PREP_GUIDE.md        # Claude Code session orchestration guide
├── PAYROLL_MODULE_INSTRUCTIONS.md   # Payroll module spec (types, formulas, UI)
├── README.md                        # Outdated — do not rely on
│
├── server.js                        # Express backend — auth, projects, clients,
│                                    #   cash advances, liquidations, suppliers,
│                                    #   forecasting (mock), attachments
│
├── src/                             # Frontend source
│   ├── App.tsx                      # Root component — theme, routing, auth guard
│   ├── index.tsx                    # ReactDOM entry point
│   │
│   ├── types/                       # TypeScript interfaces
│   │   ├── Project.ts              # 60-field Project interface
│   │   ├── Client.ts               # Client data model
│   │   ├── User.ts                 # User, LoginCredentials, AuthResponse
│   │   ├── Invoice.ts              # ProjectInvoice, ScanFile, InvoiceStatus, helpers
│   │   └── Payroll.ts              # Employee, DTREntry, PayrollRun, Payslip, DTRInput
│   │
│   ├── config/                      # App configuration
│   │   ├── api.ts                  # API_BASE URL resolver
│   │   ├── onedriveConfig.ts       # MSAL config for OneDrive
│   │   └── payrollAccess.ts        # Username-based payroll access control
│   │
│   ├── contexts/                    # React contexts
│   │   ├── AuthContext.tsx          # Auth state, login/logout, token persistence
│   │   └── OneDriveAuthContext.tsx  # MSAL auth for OneDrive
│   │
│   ├── services/                    # Data access layer
│   │   ├── dataService.ts          # Project CRUD via Express API
│   │   ├── databaseService.ts      # Legacy SQLite service (server-side only)
│   │   ├── attachmentsService.ts   # Project attachment operations
│   │   └── onedriveService.ts      # OneDrive file upload
│   │
│   ├── utils/                       # Utilities & business logic
│   │   ├── projectUtils.ts         # Misc project helpers
│   │   ├── projectBudgetStorage.ts # localStorage budget tracking
│   │   ├── logoUtils.ts            # Logo image handling
│   │   ├── oshProgramPdf.ts        # OSH program PDF builder
│   │   ├── payrollEngine.ts        # PH Labor Code computation engine
│   │   ├── governmentContrib.ts    # SSS, PhilHealth, Pag-IBIG tables
│   │   ├── taxTable.ts             # TRAIN Law withholding tax
│   │   └── firebasePayroll.ts      # Payroll Firestore CRUD layer
│   │
│   ├── data/                        # Static data
│   │   ├── mockData.ts             # Legacy mock data (not actively used)
│   │   └── phHolidays.ts           # 2026 Philippine holidays
│   │
│   ├── components/                  # Page-level components
│   │   ├── Dashboard.tsx           # Project table, KPIs, charts, import/export
│   │   ├── ProjectDetails.tsx      # Single project detail view
│   │   ├── ProjectMonitoringApp.tsx # Dashboard ↔ ProjectDetails switcher
│   │   ├── ProjectLocationDashboard.tsx
│   │   ├── AddProjectDialog.tsx
│   │   ├── EditProjectDialog.tsx
│   │   ├── ExpenseMonitoring.tsx   # Expense list with tab navigation
│   │   ├── CAFormPage.tsx          # Cash Advance request form
│   │   ├── LiquidationFormPage.tsx # Liquidation form
│   │   ├── DirectLaborPage.tsx     # Direct labor tracking
│   │   ├── ClientsPage.tsx         # Client CRUD
│   │   ├── MaterialRequestFormPage.tsx # MRF + Order tracker (combined)
│   │   ├── DeliveryPage.tsx        # Delivery receipt
│   │   ├── SuppliersPage.tsx       # Supplier + product management
│   │   ├── PurchaseOrderPage.tsx   # Purchase order creation/export
│   │   ├── EstimatesPage.tsx       # Cost estimation
│   │   ├── OrderTrackerPage.tsx    # Order tracking (redirected)
│   │   ├── ReportsPage.tsx         # Reports hub with tab sub-routes
│   │   ├── EHSPage.tsx            # EHS document management
│   │   ├── IDGeneratorPage.tsx     # Company ID card generator
│   │   ├── AcknowledgementReceiptPage.tsx
│   │   ├── PdfPreviewDialog.tsx    # Reusable PDF preview dialog
│   │   ├── UserApprovalsPage.tsx   # Superadmin: approve user registrations
│   │   ├── UsersPage.tsx           # Superadmin: user database
│   │   ├── InvestmentTrackerPage.tsx # Redesigned to match design system (May 2026)
│   │   ├── CollectionsDashboard.tsx  # Collections & AR — invoice tracking, OneDrive scan upload
│   │   ├── UpdateProgressDialog.tsx  # Lightweight modal for updating project % + PB number
│   │   ├── UtilitiesPage.tsx       # Utilities tab shell
│   │   ├── Header.tsx              # Top app bar
│   │   ├── Sidebar.tsx             # Navigation drawer (collapsed 68px / expanded 280px)
│   │   ├── LoginDialog.tsx         # Login dialog modal
│   │   └── LoginPage.tsx           # Standalone login page
│   │
│   │   ├── reports/                # Report subcomponents
│   │   │   ├── ProgressReportTab.tsx
│   │   │   ├── ServiceReportTab.tsx
│   │   │   ├── CompletionCertificateTab.tsx
│   │   │   └── AttachmentsTab.tsx
│   │   │
│   │   └── payroll/               # Payroll module (10 components)
│   │       ├── PayrollDashboard.tsx
│   │       ├── PayrollRegister.tsx
│   │       ├── PayrollRunForm.tsx   # 4-step wizard
│   │       ├── PayslipCard.tsx     # Printable payslip
│   │       ├── EmployeeList.tsx
│   │       ├── EmployeeForm.tsx
│   │       ├── GovernmentContribTable.tsx
│   │       ├── PayrollGuard.tsx    # Authorization wrapper
│   │       ├── PayrollSettings.tsx
│   │       └── HolidayManager.tsx
│   │
│   └── fonts/                      # Custom font assets
│       └── README.md
│
├── scripts/                        # 24 utility scripts
│   ├── setupDatabase.js            # Initialize SQLite DB
│   ├── migrate-excel-data.js       # Import from Excel to SQLite
│   ├── migrate-local-to-cloud.js   # SQLite → Firestore migration
│   ├── migrate-sqlite-to-firestore.js
│   ├── copy-excel-to-projects.js
│   ├── extract-directors.js
│   ├── normalize-directors.js
│   ├── map-directors-excel.js
│   ├── import-directors-to-db.js / import-directors-to-db-simple.js
│   ├── fix-director-summaries.js
│   ├── extract-pos-to-suppliers.js
│   ├── parse-excel.js              # Excel file parser
│   ├── examine-excel.js / examineExcel.js
│   ├── countColumns.js
│   ├── exportData.js               # Data export
│   ├── reload-project-data.js
│   ├── validate-data-accuracy.js   # Data validation
│   ├── extract-pdf-items.js        # PDF text extraction
│   ├── embed-arial-narrow-font.js  # Font embedding
│   └── update-frontend-data.js
│
├── database/                       # SQLite database files (local only)
├── build/                          # React production build
├── public/                         # Static assets
│
├── firebase.json                   # Firebase Hosting config
├── .firebaserc                     # Firebase project target
├── .env / .env.example            # Environment variables
├── .env.production                # Production env vars
├── render-env.txt                  # Render deployment env documentation
│
├── package.json                    # Dependencies + scripts
└── tsconfig.json                   # TypeScript configuration
```

---

## 4. Module Map

### 4.1 Auth Module

**Not Firebase Auth.** Custom auth system using username/password against `server.js` endpoints.

```
AuthContext.tsx
  ├── login(credentials)     → POST /api/auth/login
  │   Returns { user, token }
  │   Token = base64(userId:username:timestamp)
  │   Stored in localStorage as 'netpacific_token'
  │   User object stored as 'netpacific_user'
  │
  ├── logout()               → clears localStorage
  └── on mount               → GET /api/auth/me (to restore session)

server.js:
  POST /api/auth/login       → validates against Firestore 'users' collection
  POST /api/auth/register    → creates user with approved=0
  GET  /api/auth/me          → restores user from token
```

**Roles:** `superadmin` | `admin` | `user` | `viewer`

**Key files:** `src/contexts/AuthContext.tsx`, `src/types/User.ts`, `src/components/LoginPage.tsx`, `server.js` (lines 81-129)

### 4.2 Project Monitoring Module

The core module. Dashboard with KPI cards, charts, sortable project table with 50+ fields, CSV/XLSX import/export, bulk delete.

```
Dashboard.tsx
  ├── KPI cards: Total Projects, Contract Value, Backlogs, Outstanding
  ├── Charts: Financial Performance (ComposedChart), Status Distribution (PieChart)
  ├── Filters: search, status, year
  ├── Sortable project table with health indicators
  ├── CSV import / CSV+Excel export
  └── Bulk operations: delete selected

dataService.ts (singleton)
  └── All calls via → Express API → Firestore 'projects' collection

ProjectDetails.tsx
  └── Single project view (triggered by clicking a row in Dashboard)
```

**Key files:** `src/components/Dashboard.tsx`, `src/components/ProjectDetails.tsx`, `src/components/ProjectMonitoringApp.tsx`, `src/services/dataService.ts`, `src/types/Project.ts`

### 4.3 Expense Management Module

Linked chain: Cash Advance → Liquidation (with balance tracking).

```
CAFormPage.tsx                    → POST/PATCH /api/cash-advances
LiquidationFormPage.tsx           → CRUD /api/liquidations
ExpenseMonitoring.tsx             → List view with tab navigation (CA | Liquidation | Direct Labor)
DirectLaborPage.tsx
```

**Chain logic (server.js):**
- CA created with `amount` and `balance_remaining = amount`
- Liquidation submitted against a CA → `balance_remaining -= total_amount`
- Liquidation deleted → `balance_remaining += total_amount`
- Can also create liquidations without a CA

**Key files:** `src/components/CAFormPage.tsx`, `src/components/LiquidationFormPage.tsx`, `server.js` (lines 546-802)

### 4.4 Client Management Module

Separate Clients CRUD with cascading updates to linked projects.

```
ClientsPage.tsx                   → CRUD /api/clients
  └── When client name/approver changes → batch updates all related projects
```

**Key files:** `src/components/ClientsPage.tsx`, `src/types/Client.ts`, `server.js` (lines 474-544)

### 4.5 Procurement / Supply Chain Module

Multi-page module covering the procure-to-pay flow.

```
MaterialRequestFormPage.tsx       → MRF + Order tracker (combined tabbed page)
DeliveryPage.tsx                   → Delivery Receipt
SuppliersPage.tsx                  → Supplier + Product management (bulk replace)
PurchaseOrderPage.tsx              → Purchase Order creation + PDF export
EstimatesPage.tsx                  → Cost estimation / BOM
```

**Key relationships:**
- Suppliers `├──` Products (one-to-many via `supplier_id`)
- Suppliers are **bulk-replaced** (not incremental CRUD) — send full array, server deletes all then re-inserts
- PO generation involves: project selection → supplier → items → PDF export

**Key files:** All in `src/components/`, `server.js` (lines 882-954)

### 4.6 Reports Module

Four report types with PDF generation.

```
ReportsPage.tsx                    → Tab shell, route param: /reports/:tab
  ├── ProgressReportTab.tsx       → Progress report PDF
  ├── ServiceReportTab.tsx        → Service report PDF
  ├── CompletionCertificateTab.tsx → Certificate of completion PDF
  └── AttachmentsTab.tsx          → OneDrive file attachments per project
```

Saved progress/service reports are stored per project in localStorage. Loading a saved service report switches the save action into update mode; saved service reports and progress snapshots expose visible load/delete actions. Report prepared-by designation refreshes from the logged-in user's `designation` when the saved prepared-by identity matches the current user.

**Key files:** `src/components/ReportsPage.tsx`, `src/components/reports/*.tsx`, `src/services/attachmentsService.ts`, `src/services/onedriveService.ts`, `src/contexts/OneDriveAuthContext.tsx`

### 4.7 Utilities Module

EHS (Environment, Health, Safety) docs + ID card generator + Acknowledgement Receipt.

```
UtilitiesPage.tsx                  → Tab shell, route param: /utilities/:tab
  ├── EHSPage.tsx                 → Safety Certificate, Safety Manual, OSH Program PDFs
  ├── IDGeneratorPage.tsx         → Company ID card generator with barcode
  └── AcknowledgementReceiptPage.tsx → Payment acknowledgement receipt
```

**Key files:** `src/components/UtilitiesPage.tsx`, `src/components/EHSPage.tsx`, `src/components/IDGeneratorPage.tsx`, `src/components/AcknowledgementReceiptPage.tsx`, `src/utils/oshProgramPdf.ts`, `src/utils/logoUtils.ts`

### 4.8 Payroll Module

Fully self-contained payroll submodule. See `PAYROLL_MODULE_INSTRUCTIONS.md` for detailed spec.

```
PayrollDashboard.tsx               → KPI cards, payroll cost chart
PayrollRegister.tsx                → Table of all payroll runs
PayrollRunForm.tsx                 → 4-step wizard: Period → DTR → Preview → Approve
PayslipCard.tsx                    → Individual payslip (CMR Philippines format) + print
EmployeeList.tsx                   → Employee DataGrid CRUD
EmployeeForm.tsx                   → Employee create/edit dialog
GovernmentContribTable.tsx         → Monthly SSS/PhilHealth/Pag-IBIG remittance summary
PayrollGuard.tsx                   → Hides payroll from non-authorized users
PayrollSettings.tsx                → Payroll configuration
HolidayManager.tsx                 → PH holiday management
```

**Key files:** `src/components/payroll/*.tsx`, `src/types/Payroll.ts`, `src/utils/payrollEngine.ts`, `src/utils/governmentContrib.ts`, `src/utils/taxTable.ts`, `src/utils/firebasePayroll.ts`, `src/data/phHolidays.ts`, `src/config/payrollAccess.ts`

### 4.9 OneDrive Integration Module

Enables attaching project files stored in OneDrive.

```
OneDriveAuthContext.tsx            → MSAL auth context
onedriveConfig.ts                  → MSAL configuration
onedriveService.ts                 → Upload to OneDrive via Microsoft Graph API
attachmentsService.ts              → Save attachment metadata to Firestore
```

**Key files:** `src/contexts/OneDriveAuthContext.tsx`, `src/config/onedriveConfig.ts`, `src/services/onedriveService.ts`, `src/services/attachmentsService.ts`

---

## 5. Routing Map

All routes defined in `src/App.tsx`. Routes are guarded by `ProtectedRoute` (checks `isAuthenticated`) and optionally `SuperadminRoute`.

| Path | Component | Guard | Notes |
|---|---|---|---|
| `/login` | `LoginPage` | None | Standalone login, no AppLayout |
| `/dashboard` | `ProjectMonitoringApp` | Auth | Dashboard ↔ ProjectDetails switcher |
| `/location-analysis` | `ProjectLocationDashboard` | Auth | Location insights |
| `/expense-monitoring` | `ExpenseMonitoring` | Auth | Tab shell |
| `/expense-monitoring/ca-form` | `CAFormPage` | Auth | Nested route |
| `/expense-monitoring/liquidation-form` | `LiquidationFormPage` | Auth | Nested route |
| `/expense-monitoring/direct-labor` | `DirectLaborPage` | Auth | Nested route |
| `/clients` | `ClientsPage` | Auth | |
| `/material-request` | `MaterialRequestFormPage` | Auth | Combines MR + Order tracker |
| `/order-tracker` | Redirect → `/material-request?tab=orders` | Auth | |
| `/delivery` | `DeliveryPage` | Auth | |
| `/suppliers` | `SuppliersPage` | Auth | |
| `/purchase-order` | `PurchaseOrderPage` | Auth | |
| `/estimates` | `EstimatesPage` | Auth | |
| `/reports/:tab?` | `ReportsPage` | Auth | Tab param: progress/service/completion/attachments |
| `/utilities` | `UtilitiesPage` | Auth | Tab shell with nested routes |
| `/utilities/ehs/:tab?` | `EHSPage` | Auth | |
| `/utilities/id-generator` | `IDGeneratorPage` | Auth | |
| `/utilities/acknowledgement-receipt` | `AcknowledgementReceiptPage` | Auth | |
| `/user-approvals` | `UserApprovalsPage` | Auth + Superadmin | |
| `/settings` | Redirect → `/settings/users` | Auth + Superadmin | |
| `/settings/users` | `UsersPage` | Auth + Superadmin | Settings user management |
| `/users` | Redirect → `/settings/users` | Auth + Superadmin | Legacy redirect |
| `/investment-tracker` | `InvestmentTrackerPage` | Auth | |
| `/collections` | `CollectionsDashboard` | Auth | AR dashboard — invoices across all projects |
| `/payroll` | `PayrollDashboard` | Auth + PayrollGuard | Guard checks username-based access |
| `/` | Redirect → `/dashboard` | Auth | |
| `/ehs` | Redirect → `/utilities/ehs` | — | Legacy redirect |
| `/id-generator` | Redirect → `/utilities/id-generator` | — | Legacy redirect |

All authenticated routes wrap in `<AppLayout>` which provides `Header` + `Sidebar` + content area.

---

## 6. API Reference (Express Backend)

The Express server runs on port 3001 (`server.js`). All API routes are prefixed with `/api`.

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | No | Username + password → token + user |
| POST | `/api/auth/register` | No | Create user (pending approval) |
| GET | `/api/auth/me` | Token | Get current user from token |

### Users (superadmin only)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/users` | List all users |
| GET | `/api/users/pending` | List pending approval users |
| PATCH | `/api/users/:id` | Update user fields |
| POST | `/api/users/:id/approve` | Approve user |
| DELETE | `/api/users/:id` | Delete user |

### Projects

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/projects` | List projects (filters: status, year, search, client, category) |
| GET | `/api/projects/count` | Total project count |
| GET | `/api/projects/unique/statuses` | Unique status values |
| GET | `/api/projects/unique/years` | Unique year values |
| GET | `/api/projects/unique/categories` | Unique category values |
| GET | `/api/projects/unique/clients` | Unique client names (from clients + projects) |
| GET | `/api/projects/:id` | Single project |
| POST | `/api/projects` | Create project |
| POST | `/api/projects/bulk` | Bulk create (batch of 500) |
| PUT | `/api/projects/:id` | Update project |
| DELETE | `/api/projects` | Bulk delete (body: `{ ids: number[] }`) |

### Stats

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/stats` | Aggregate: total projects, by status, by director, contract value, billed |

### Clients

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/clients` | List all clients |
| GET | `/api/clients/:id` | Single client |
| POST | `/api/clients` | Create client (cascades to linked projects) |
| PUT | `/api/clients/:id` | Update client (cascades to linked projects) |
| DELETE | `/api/clients/:id` | Delete client |

### Cash Advances

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/cash-advances` | List CAs (admin = all, user = own) |
| POST | `/api/cash-advances` | Create CA request |
| PATCH | `/api/cash-advances/:id` | Approve/reject (admin only) |
| DELETE | `/api/cash-advances/:id` | Delete CA (updates linked liquidations) |

### Liquidations

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/liquidations` | List liquidations |
| GET | `/api/liquidations/next-form-no` | Next LQ-XXXX form number |
| GET | `/api/liquidations/:id` | Single liquidation |
| POST | `/api/liquidations` | Create liquidation (draft or submitted) |
| PUT | `/api/liquidations/:id` | Update liquidation (draft only) |
| DELETE | `/api/liquidations/:id` | Delete liquidation (restores CA balance) |

### Suppliers

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/suppliers` | List suppliers with products |
| POST | `/api/suppliers` | **Bulk replace** — deletes all, inserts all |
| DELETE | `/api/suppliers/:id` | Delete supplier + linked products |

### Attachments

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/projects/:id/attachments` | List attachments for project |
| POST | `/api/projects/:id/attachments` | Save attachment metadata |
| DELETE | `/api/projects/:projectId/attachments/:attachmentId` | Delete attachment |

### Forecasting

All static/mock data.

| Method | Endpoint |
|---|---|
| GET | `/api/forecasting/revenue` |
| GET | `/api/forecasting/cashflow` |
| GET | `/api/forecasting/projects` |
| GET | `/api/forecasting/metrics` |

### Expenses (static)

| Method | Endpoint |
|---|---|
| GET | `/api/expenses/categories` |
| GET | `/api/expenses` |
| POST | `/api/expenses` |

---

## 7. Firestore Schema

### `users` collection
```
/users/{userId}
  username: string
  email: string
  password_hash: string (base64 of plaintext — NOT secure hashing)
  role: "superadmin" | "admin" | "user" | "viewer"
  approved: 0 | 1
  full_name: string | null
  designation: string | null
  created_at: number (unix seconds)
  updated_at: number (unix seconds)
```

### `projects` collection
```
/projects/{projectId}
  item_no: number
  year: number
  am: string
  ovp_number: string
  po_number: string
  po_date: number | null (unix seconds)
  client_status: string
  client_id: number | null
  account_name: string
  project_name: string
  project_category: string
  project_location: string
  scope_of_work: string
  qtn_no: string
  ovp_category: string
  contract_amount: number
  updated_contract_amount: number
  down_payment_percent: number
  retention_percent: number
  start_date: number | null
  duration_days: number
  completion_date: number | null
  payment_schedule: string
  payment_terms: string
  bonds_requirement: string
  project_director: string
  client_approver: string
  progress_billing_schedule: string
  mobilization_date: number | null
  updated_completion_date: number | null
  project_status: string
  actual_site_progress_percent: number
  actual_progress: number
  evaluated_progress_percent: number
  evaluated_progress: number
  for_rfb_percent: number
  for_rfb_amount: number
  rfb_date: number | null
  type_of_rfb: string
  work_in_progress_ap: number
  work_in_progress_ep: number
  updated_contract_balance_percent: number
  total_contract_balance: number
  updated_contract_balance_net_percent: number
  updated_contract_balance_net: number
  remarks: string
  contract_billed_gross_percent: number
  contract_billed: number
  contract_billed_net_percent: number
  amount_contract_billed_net: number
  for_retention_billing_percent: number
  amount_for_retention_billing: number
  retention_status: string
  unevaluated_progress: number
  created_at: string (ISO)
  updated_at: string (ISO)
```

### `clients` collection
```
/clients/{clientId}
  client_name: string
  address: string
  payment_terms: string
  contact_person: string
  designation: string
  email_address: string
  created_at: string (ISO)
  updated_at: string (ISO)
```

### `cash_advances` collection
```
/cash_advances/{caId}
  user_id: string
  amount: number
  balance_remaining: number
  status: "pending" | "approved" | "rejected"
  purpose: string | null
  breakdown: Array<{ category: string, description: string, amount: number }> | null
  project_id: string | null
  requested_at: number (unix seconds)
  approved_at: number | null
  approved_by: string | null
  created_at: number (unix seconds)
  updated_at: number (unix seconds)
```

### `liquidations` collection
```
/liquidations/{liquidationId}
  user_id: string
  form_no: string | null (e.g. "LQ-0001")
  date_of_submission: string | null
  employee_name: string | null
  employee_number: string | null
  rows_json: string (JSON array of line items)
  total_amount: number
  ca_id: string | null (linked cash advance)
  status: "draft" | "submitted"
  created_at: number (unix seconds)
  updated_at: number (unix seconds)
```

### `suppliers` collection
```
/suppliers/{supplierId}
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  payment_terms: string | null
  created_at: string (ISO)
```

### `supplier_products` collection
```
/supplier_products/{productId}
  supplier_id: string
  name: string | null
  part_no: string | null
  description: string | null
  brand: string | null
  unit: string ("pcs" default)
  unit_price: number | null
  price_date: string | null
```

### `project_attachments` collection
```
/project_attachments/{attachmentId}
  project_id: string
  filename: string
  onedrive_item_id: string
  onedrive_web_url: string | null
  file_size: number | null
  uploaded_by: string | null
  created_at: string (ISO)
```

### Payroll Collections (subcollections under `payrollRuns`)

See `PAYROLL_MODULE_INSTRUCTIONS.md` section "Firestore Collections" and `src/types/Payroll.ts` for full field definitions.

- `/employees/{employeeId}` — Employee master data
- `/payrollRuns/{runId}` — Payroll run periods
- `/payrollRuns/{runId}/dtrEntries/{entryId}` — Daily time records
- `/payrollRuns/{runId}/payslips/{employeeId}` — Computed payslips
- `/phHolidays/{holidayId}` — Philippine holidays

---

## 8. Data Flow Patterns

### 8.1 Auth Flow

```
LoginPage.tsx
  └── AuthContext.login(username, password)
        └── POST /api/auth/login → server.js validates against Firestore 'users'
              └── Returns { user, token }
                    └── Token stored in localStorage 'netpacific_token'
                    └── User stored in localStorage 'netpacific_user'
                          └── ProtectedRoute checks isAuthenticated from AuthContext

On page reload:
  AuthContext mounts → reads 'netpacific_token' from localStorage
    └── GET /api/auth/me with Bearer token
          └── If valid → restore user to context
          └── If invalid → clear localStorage, redirect to /login
```

### 8.2 Project CRUD Flow

```
Dashboard.tsx
  └── dataService.getProjects(filters) → GET /api/projects?...params...
        └── server.js → db.collection('projects').orderBy('created_at').get()
              └── Returns Project[] (server applies JS-side filtering for non-native filters)

AddProjectDialog.tsx
  └── dataService.addProject(data) → POST /api/projects
        └── server.js → resolves client_id → account_name, creates project
```

### 8.3 Cash Advance → Liquidation Chain

```
CA created:        POST /api/cash-advances → { amount, balance_remaining: amount }
CA approved:       PATCH /api/cash-advances/:id → status: "approved"
Liquidation created against CA:
                   POST /api/liquidations → { ca_id, total_amount }
                     └── server.js → cash_advances.balance_remaining -= total_amount
Liquidation deleted:
                   DELETE /api/liquidations/:id
                     └── server.js → cash_advances.balance_remaining += total_amount
```

### 8.4 Supplier Bulk Replace Flow

```
POST /api/suppliers (receives full array)
  1. Delete ALL existing suppliers + supplier_products
  2. Insert all suppliers from request body
  3. Insert all products from request body
  ⚠️ This is NOT incremental CRUD. You must send the complete dataset every time.
```

### 8.5 Payroll Access Control

Payroll access is gated by **username**, not Firebase UID or custom claims:
- `src/config/payrollAccess.ts` → `PAYROLL_AUTHORIZED_USERNAMES = ['TJC', 'RJR']`
- `Sidebar.tsx` → `{isPayrollAuthorized(user?.username) && <PayrollNavItem />}`
- `PayrollGuard.tsx` → wraps the payroll route, shows "Access Restricted" for unauthorized users

---

## 9. Key Gotchas

### Custom Auth — NOT Firebase Auth
The app uses a **custom username/password auth** against the Express backend, not Firebase Authentication. Passwords are stored as **base64** (not hashed). Tokens are base64-encoded `userId:username:timestamp` strings stored in `localStorage`. There is no JWT, no session, no Firebase Auth integration.

### Payroll Access is Username-Based
`isPayrollAuthorized()` checks `user.username` values `['TJC', 'RJR']`, not Firebase UIDs or roles. This is separate from the role system (`superadmin`/`admin`/`user`/`viewer`).

Current production `TJC` and `RJR` user records are approved superadmins. There are two `TJC` Firestore records; both are approved superadmins and should be deduplicated only after confirming the actively used account.

### Account Designations Feed Signatures
Report prepared-by signatures use the logged-in user's account designation when the saved prepared-by identity matches the current user. Calcsheet quotation signing merges the logged-in user account into the signatory list and prefers the account designation for exact or first/last-name matches before falling back to `src/data/quotationClients.ts`.

### Supplier Management is Bulk-Replace Only
You cannot incrementally add/edit/delete a single supplier or product. The entire supplier list is sent as a JSON array, and the server deletes everything then re-inserts it all. This means supplier changes require the complete dataset.

### Ca/ Liquidation Balance Tracking is Server-Enforced
The `balance_remaining` on cash advances is managed server-side. When a liquidation is submitted or deleted, the server atomically adjusts the CA balance. This logic is NOT replicated in Firestore rules.

### Forecasting Data is Static/Mock
All `/api/forecasting/*` endpoints return hardcoded JSON. There is no real forecasting logic — it's placeholder data.

### Project Filtering is Partially Server-Side
The `GET /api/projects` endpoint fetches ALL projects from Firestore ordered by `created_at desc`, then applies filters (status, year, category, client, search) **in JavaScript on the server**. This is inefficient for large datasets but works for IOCT's scale.

### Timestamps are Inconsistent
Projects use ISO strings for `created_at`/`updated_at`. Cash advances and liquidations use Unix timestamps (seconds). PO dates are also Unix timestamps. The `dataService.formatDate()` helper handles both formats.

### databaseService.ts is Legacy/Local
`src/services/databaseService.ts` uses `better-sqlite3` and was the original data layer before Firestore migration. It still exists but the running application uses `dataService.ts` (Express → Firestore). The SQLite file is in `database/projects.db`.

### Backup of `server.js` Ends at Line 954
The server.js file continues beyond the 954 lines shown here with additional routes for expenses, cash advances, liquidations, forecasting, attachments, and suppliers. The complete file is ~1000+ lines.

### Payroll Module Was Added After the Fact
The payroll module (`src/components/payroll/`, `src/types/Payroll.ts`, `src/utils/payrollEngine.ts`, etc.) was built on top of the existing Project Monitoring app. It uses its own Firestore collections (`employees`, `payrollRuns`, `phHolidays`) and has its own access control layer separate from the main auth system.
