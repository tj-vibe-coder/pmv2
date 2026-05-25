# Architecture Overview

## Purpose

This document explains the high-level structure of pmv2, the IOCT Project Monitoring System.

Use this as a quick orientation file for agents and developers.

---

## System Overview

pmv2 is a **monolithic web application** — a React 19 + TypeScript frontend served by an Express 5 backend, backed by Firebase Firestore. Auth is a custom username/password system (NOT Firebase Auth) using base64 tokens. The app is deployed on Firebase Hosting (frontend) + Cloud Functions (API), with a legacy SQLite layer for historical data migration.

## Main Modules

| Module | Purpose | Key Files/Folders |
|---|---|---|
| **Auth** | Custom login, registration, role-based access | `contexts/AuthContext.tsx`, `components/LoginPage.tsx`, `server.js` (auth routes) |
| **Project Monitoring** | Dashboard, KPI charts, project CRUD, import/export | `components/Dashboard.tsx`, `components/ProjectDetails.tsx`, `services/dataService.ts` |
| **Project List** | Detailed projects view for the main operations module | `components/ProjectMonitoringApp.tsx` |
| **Expense Management** | Cash advances, liquidations, direct labor | `components/CAFormPage.tsx`, `components/LiquidationFormPage.tsx`, `components/ExpenseMonitoring.tsx` |
| **Procurement** | Material requests, delivery receipts, suppliers, purchase orders, estimates | `components/MaterialRequestFormPage.tsx`, `components/PurchaseOrderPage.tsx`, `components/SuppliersPage.tsx` |
| **Reports** | Progress reports, service reports, completion certificates, saved-report snapshots, OneDrive attachments | `components/ReportsPage.tsx`, `components/reports/*` |
| **Utilities** | EHS documents, ID generator, acknowledgement receipts | `components/EHSPage.tsx`, `components/IDGeneratorPage.tsx` |
| **Payroll** | Employee management, PH labor code computation, payslip generation | `components/payroll/*`, `utils/payrollEngine.ts`, `utils/governmentContrib.ts` |
| **OneDrive Integration** | File attachments via Microsoft Graph API | `contexts/OneDriveAuthContext.tsx`, `services/onedriveService.ts` |
| **Admin / Settings** | User approvals, settings-based user database management | `components/UserApprovalsPage.tsx`, `components/UsersPage.tsx` |

---

## Data Flow

```
User action → React Component → dataService / firebasePayroll → Express API → Firestore → Response → UI update

Auth flow:
LoginPage → AuthContext.login() → POST /api/auth/login → server.js validates against Firestore 'users'
  → Returns { user, token: base64(userId:username:timestamp) }
  → Token stored in localStorage 'netpacific_token'
  → All subsequent API calls include Authorization: Bearer <token>
```

All API calls go through the Express backend (`server.js`), which uses Firebase Admin SDK to read/write Firestore. The frontend does NOT call Firestore directly (except for the payroll module via `firebasePayroll.ts`, which uses the client Firestore SDK).

---

## Authentication Flow

```
1. User visits / → ProtectedRoute checks AuthContext.isAuthenticated → redirects to /login
2. User submits credentials → POST /api/auth/login with username + password
3. Server validates against Firestore 'users' collection:
   - Matches username → compares base64(password) with password_hash
   - Checks approved status (must be 1, except superadmin)
4. Returns { user, token } → stored in localStorage
5. On page reload: AuthContext reads token from localStorage → GET /api/auth/me → restores session
```

**Roles:** `superadmin` | `admin` | `user` | `viewer`
**Payroll access:** username-based (`TJC` or `RJR`), separate from role system.
Current production `TJC` and `RJR` user records are approved superadmins.

User profile fields (`full_name`, `designation`) feed report prepared-by signatures. Calcsheet quotation signing also merges the logged-in user account into the signatory list so matching signatories use the account designation before fallback seed titles.

---

## Database Notes

**Firestore (production)** — 13+ collections:
- `users`, `projects` (60+ fields), `clients`, `cash_advances`, `liquidations`
- `suppliers`, `supplier_products`, `project_attachments`
- `employees`, `payrollRuns` (with subcollections `dtrEntries`, `payslips`), `phHolidays`

**SQLite (legacy)** — `database/projects.db`, used for historical data migration. Not used at runtime.

Full schema: see `docs/DATA_MODEL.md`.

---

## Deployment Notes

- **Frontend:** Firebase Hosting (`pmv2-851ae.web.app`) — CDN, no cold starts
- **API:** Cloud Function (`api-2g62nnt3fa-uc.a.run.app`) — Node 22, 2nd Gen
- **Firebase Console:** https://console.firebase.google.com/project/pmv2-851ae
- **Local dev:** `npm start` boots server (port 3001) + client (port 3000)
- **Local writes to production Firestore** — be careful

---

## Known Architecture Risks

- **Custom auth**: base64-encoded tokens with plaintext-equivalent passwords — not production-grade security
- **No Firebase Auth**: the custom system is fragile, tokens are easy to forge, no refresh mechanism
- **Single Express monolith**: all routes in one `server.js` (1000+ lines), no middleware layering
- **Project filtering**: fetches ALL projects from Firestore then filters in-memory — won't scale beyond thousands of records
- **Supplier bulk replace**: POST deletes all suppliers/products then re-inserts — data loss risk if request fails mid-flight
- **No automated tests**: `App.test.tsx` exists but coverage is near-zero
- **Password rotation needed**: default user passwords visible in git history
