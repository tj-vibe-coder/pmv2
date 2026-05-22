# IOCT Project Monitoring System v2 (pmv2)

A full-featured internal operations platform for IOCT — covering project monitoring, financial tracking, supply chain, quotations/calcsheets, payroll, expense management, reporting, and utilities.

Built with React + TypeScript, backed by a Node/Express + Firebase/Firestore server.

---

## 🗺️ Navigation & Modules

The app uses a Gmail-style collapsible sidebar (collapsed to icons by default, expands on hover). The following modules are accessible:

### Project List
- Sortable/filterable table of all IOCT projects
- Add, edit, and track projects with status, billing, and financial health indicators
- Project detail view with contract amounts, billed, outstanding balance, retention
- Color-coded health indicators (green / orange / red)

### Dashboard
- Location-based analytics and project insights
- Per-region project breakdown and performance overview

### Expense Monitoring *(collapsible group)*
- **Expense Monitoring** — project-level expense tracking
- **CA Form** — cash advance request forms
- **Liquidation Form** — liquidation of cash advances
- **Direct Labor** — direct labor cost recording
- **Payroll** *(authorized users only — TJC & RJR)* — full payroll module (see below)

### Clients
- Client database with contact management
- Payment terms, account managers, and multi-contact support

### Investment Tracker
- Founder contributions and company-level expense tracking

### Calcsheet *(Quotation Management)*
Full quotation/proposal system for IOCT and ACTI:
- **Projects list** — filter/sort by status, customer, year, formula type; scroll-position memory when navigating back
- **Project detail** — per-project quotation management with drag-and-drop legacy import
- **Quotation editor** — itemized line-item editor with labor roles, materials, and overhead
- **Compare view** — side-by-side IOCT vs ACTI quotation comparison
- **Legacy import** — bulk import of historical `.xlsx` and `.pdf` calcsheets
- **Clients** — calcsheet-specific client and contact management
- **Presets** — labor role preset library

Project codes follow the format `PCS{YYMM}{SEQ}-{CLI}-{REV}` (e.g. `PCS2605034-LBI-00`). Auto-generated on project creation but editable.

### Supply Chain *(collapsible group)*
- **Requests & Orders** — material request forms
- **Delivery Receipt** — delivery tracking
- **Suppliers** — supplier database
- **Purchase Order** — PO management
- **Estimates** — cost estimates

### Reports *(collapsible group)*
- **Progress Report** — PDF progress reports per project
- **Service Report** — service completion reports
- **Certificate of Completion** — formal completion certificates
- **Attachments** — OneDrive-backed file attachments per project

### Utilities *(collapsible group)*
- **Safety Certificate** — EHS safety certificate PDF generation
- **Safety Manual** — EHS safety manual
- **OSH Program** — Occupational Safety and Health program document
- **ID Generator** — employee ID card generator
- **Acknowledgement Receipt** — acknowledgement receipt document

### Admin *(superadmin only)*
- **User Approvals** — approve/reject new user registrations
- **Users DB** — full user management

---

## 💸 Payroll Module *(restricted)*

Access controlled via `isPayrollAuthorized()` — visible only to TJC and RJR. Accessible under **Expense Monitoring → Payroll**.

- Employee database with government contribution tables
- Payroll run management with holiday adjustments
- Payroll register and payslip generation
- Government contributions: SSS, PhilHealth, Pag-IBIG
- Payroll settings (cut-off periods, etc.)

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript |
| UI | Material UI (MUI) v5 |
| State | Zustand (`quotationStore`, `AuthContext`) |
| Charts | Recharts |
| PDF | `@react-pdf/renderer` |
| Dates | `date-fns` |
| Backend | Node.js + Express |
| Database | Firebase Firestore |
| Auth | Custom JWT / Firebase Auth |
| Cloud storage | OneDrive (Microsoft Graph API) |
| Hosting | Firebase Hosting + Render (server) |

---

## 📁 Project Structure

```
src/
├── components/
│   ├── calcsheet/          # Quotation/calcsheet module
│   ├── payroll/            # Payroll module (restricted)
│   ├── reports/            # Report tabs (Progress, Service, Completion, Attachments)
│   ├── Sidebar.tsx         # Gmail-style collapsible nav
│   ├── Header.tsx
│   ├── Dashboard.tsx
│   ├── ProjectMonitoringApp.tsx
│   ├── ExpenseMonitoring.tsx
│   ├── CAFormPage.tsx
│   ├── LiquidationFormPage.tsx
│   ├── DirectLaborPage.tsx
│   ├── ClientsPage.tsx
│   ├── InvestmentTrackerPage.tsx
│   ├── SuppliersPage.tsx
│   ├── PurchaseOrderPage.tsx
│   ├── DeliveryPage.tsx
│   ├── EstimatesPage.tsx
│   ├── EHSPage.tsx
│   ├── IDGeneratorPage.tsx
│   ├── AcknowledgementReceiptPage.tsx
│   └── ...
├── contexts/
│   ├── AuthContext.tsx
│   └── OneDriveAuthContext.tsx
├── store/
│   └── quotationStore.ts   # Zustand store for calcsheet data
├── types/
│   ├── Project.ts
│   ├── Quotation.ts
│   ├── Client.ts
│   ├── User.ts
│   └── Payroll.ts
├── utils/
│   └── calcsheet/          # Code generation, PDF export, calc logic
├── config/
│   └── payrollAccess.ts    # Payroll authorization whitelist
└── App.tsx                 # Routes + AppLayout
```

---

## 🔐 Auth & Roles

| Role | Access |
|---|---|
| `viewer` | Read-only project and dashboard views |
| `user` | Standard access to all non-admin modules |
| `admin` | Extended permissions |
| `superadmin` | Full access including User Approvals and Users DB |
| Payroll whitelist | Payroll module (TJC, RJR by username) |

---

## 🚀 Running Locally

```bash
# Install dependencies
npm install

# Start frontend dev server (port 3000)
npm start

# Start backend server (separate terminal)
node server.js
```

### Environment Variables

```env
REACT_APP_ONEDRIVE_CLIENT_ID=<Azure app client ID>
```

OneDrive files are stored under `Projects/{projectId}/` in the authenticated user's OneDrive.

---

## 📦 Build & Deploy

```bash
# Production build
npm run build

# Firebase deploy (hosting)
firebase deploy
```

Backend is deployed separately on Render.

---

**Built for IOCT internal use. All rights reserved.**
