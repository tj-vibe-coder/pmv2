# Employee Portal with DTR + Liquidation

**Date:** 2026-06-22
**Status:** Approved
**Scope:** New employee portal workspace, DTR entry page, role-based routing

## Problem

Regular employees (role `user`/`viewer`) currently land on the full PM dashboard after login, which exposes project management, finance, and sales modules they don't need. Employees need a focused portal where they can:
1. Log their Daily Time Record (hours, day type, overtime)
2. Submit expense liquidation forms

## Solution

A lightweight employee portal at `/employee/*` with its own slim sidebar. After login, `user`/`viewer` roles are redirected to `/employee` instead of `/dashboard`. The portal has two pages: DTR entry and the existing `LiquidationFormPage` (reused as-is).

## Architecture

### Routing & Access

**Login redirect:** After successful login, check `user.role`:
- `superadmin` / `admin` → `/dashboard` (existing behavior)
- `user` / `viewer` → `/employee`

**Route protection:**
- `/employee/*` routes wrapped in `ProtectedRoute` (must be logged in), not `SuperadminRoute`
- Admins can navigate to `/employee` manually (useful for testing)
- `user`/`viewer` navigating to `/dashboard`, `/finance/*`, `/sales/*` get redirected to `/employee`

**Route table:**

| Path | Component | Purpose |
|------|-----------|---------|
| `/employee` | `EmployeePortalHome` | Landing with DTR + Liquidation cards |
| `/employee/dtr` | `DTRPage` | Daily time record entry and history |
| `/employee/liquidation-form` | `LiquidationFormPage` (existing) | Same component, mounted at employee path |

### Files

| File | Action | Purpose |
|------|--------|---------|
| `src/components/employee/EmployeePortalHome.tsx` | Create | Landing page with two module cards |
| `src/components/employee/EmployeeNavList.tsx` | Create | Slim sidebar nav (Home, DTR, Liquidation) |
| `src/components/employee/DTRPage.tsx` | Create | DTR entry form + history table |
| `src/App.tsx` | Modify | Add `/employee/*` routes, role-based redirect guard |
| `src/components/Header.tsx` | Modify | Hide workspace switcher for `/employee` prefix, show "Employee Portal" title |
| `src/components/Sidebar.tsx` | Modify | Render `EmployeeNavList` when on `/employee/*` path |
| `server.js` | Modify | Add DTR CRUD endpoints |
| `src/types/Payroll.ts` | Modify | Add `remarks` and `submittedAt` to `DTREntry` |

### No new dependencies

Uses existing MUI components, Firestore, Express patterns.

## Design

### Employee Portal Layout

**Sidebar:** Uses the existing collapsible `Sidebar.tsx`. When `pathname.startsWith('/employee')`, it renders `EmployeeNavList` instead of the PM/Sales/Finance nav lists. Three items: Home, DTR, Liquidation.

**Header:** `Header.tsx` detects `/employee` prefix → hides the workspace `ToggleButtonGroup`, shows "Employee Portal" as the title text. User avatar and logout menu unchanged.

**Landing page (`EmployeePortalHome.tsx`):** Follows the design philosophy — `Box` root, `h4` title, `NET_PACIFIC_COLORS`, gradient KPI cards. Two clickable cards:
- **DTR** — calendar icon, "Daily Time Record", navigates to `/employee/dtr`
- **Liquidation** — receipt icon, "Expense Liquidation", navigates to `/employee/liquidation-form`

### DTR Page

Accordion-based layout matching the redesigned report pages.

**Accordion 1: New Entry** (expanded by default)

Fields in a Grid layout:
- **Date** — `TextField type="date"`, defaults to today, `InputLabelProps={{ shrink: true }}`
- **Day Type** — `Select`: Regular, Rest Day, Special Holiday, Regular Holiday, Special Holiday + Rest Day, Regular Holiday + Rest Day (existing `DayType` enum from `Payroll.ts`)
- **Regular Hours** — `TextField type="number"`, default 8, min 0, max 24
- **Overtime Hours** — `TextField type="number"`, default 0, min 0, max 16
- **Night Diff Hours** — `TextField type="number"`, default 0, min 0, max 16
- **Tardiness (minutes)** — `TextField type="number"`, default 0, min 0
- **Absent** — `Checkbox` with label
- **Remarks** — `TextField`, optional, placeholder "e.g. site work at LBI plant"

Auto-fill logic: when Absent is checked, Regular Hours sets to 0 and OT/Night Diff/Tardiness disable.

Chip on accordion header: "Ready" when date is set.

**Accordion 2: My DTR History** (expanded by default)

Table with columns: Date, Day Type, Regular Hrs, OT Hrs, Night Diff, Tardy (min), Absent, Remarks, Actions.
- Newest entries first
- Month/Year filter dropdowns above the table (default: current month)
- Load button per row (fills Accordion 1 for editing)
- Delete button per row (confirmation dialog)
- Selected/editing row highlighted

Chip on accordion header: entry count for the filtered month.

**Sticky bottom bar:**
- Left: "June 2026 — 15 entries" (filtered month context)
- Right: Save button (disabled when no date set; shows "Saved" for 2s after save)

Validation: prevent duplicate entries for the same date (check before POST/PUT, show warning).

### DTR Data Model

Extends the existing `DTREntry` interface in `src/types/Payroll.ts`:

```ts
interface DTREntry {
  id: string;
  employeeId: string;    // logged-in user's ID from the users collection
  entryDate: string;     // YYYY-MM-DD
  dayType: DayType;
  regularHours: number;
  overtimeHours: number;
  nightDiffHours: number;
  isAbsent: boolean;
  tardinessMinutes: number;
  remarks?: string;      // NEW — optional free text
  submittedAt?: string;  // NEW — ISO timestamp of last save
}
```

**Firestore collection:** `dtr_entries`

No composite indexes needed — queries use single-field `where` on `employeeId` + client-side filtering by month.

**Employee ID mapping:** `DTREntry.employeeId` stores the `users` collection document ID (from `AuthContext`). The payroll module's `employees` collection is separate — when payroll needs to read DTR, it joins via a user ID lookup. This avoids coupling DTR to the payroll employee setup.

### API Endpoints

All endpoints require authentication via `getCurrentUser(req)`.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/dtr?employeeId=X` | Users can only query own ID; admins can query any | List DTR entries |
| `POST` | `/api/dtr` | Any authenticated user | Create entry |
| `PUT` | `/api/dtr/:id` | Only own entries; admins can edit any | Update entry |
| `DELETE` | `/api/dtr/:id` | Only own entries; admins can delete any | Delete entry |

**Ownership check:** On PUT/DELETE, read the document first, compare `employeeId` to the authenticated user's ID. Admins (`role === 'superadmin' || role === 'admin'`) bypass the check.

**Duplicate check:** POST checks for an existing entry with the same `employeeId` + `entryDate`. Returns 409 if found.

### Liquidation in Employee Portal

Mount the existing `LiquidationFormPage` at `/employee/liquidation-form`. No component changes needed — it fetches its own data and works standalone.

### Role-Based Route Guard

A new `EmployeeOnlyRedirect` component in `App.tsx` that wraps admin-only routes:
- If the logged-in user has role `user` or `viewer` and is trying to access a non-`/employee` route, redirect to `/employee`
- Admins/superadmins pass through unchanged

Implementation: wrap the existing `<ProtectedRoute>` children for `/dashboard`, `/finance/*`, `/sales/*`, `/reports/*` etc. with this guard. Or simpler: in `AppLayout` (if one exists) or the top-level route element, check role + pathname and redirect.

## Out of Scope

- DTR approval workflow (entries are trusted as submitted)
- Payslip viewing in the employee portal
- CA form in the employee portal (only liquidation)
- Changes to the Payroll module's DTR consumption (it already has the types)
- Mobile-specific layout (responsive MUI handles it)
- Biometric/GPS clock-in (manual entry only)
