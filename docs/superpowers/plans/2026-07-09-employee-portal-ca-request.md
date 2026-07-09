# Employee Portal CA Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let employees request and track Cash Advances from the employee portal by reusing the existing `CAFormPage` at a new `/employee/ca-form` route.

**Architecture:** Pure wiring — a new route in `App.tsx` (mirroring the portal's existing `/employee/liquidation-form` entry), a sidebar nav item, and a home card. `CAFormPage` is already role-aware (non-admins see own balance/requests only) and the server already scopes `GET /api/cash-advances` to the requesting user, so no page, store, or server changes.

**Tech Stack:** React 19 + TypeScript, MUI v7, react-router v6. CRA — verify with `npx tsc --noEmit`; browser verification on TJ's machine uses the repo-local `verify` skill (client + mock API on 3001; this machine has no Firestore creds).

**Spec:** `docs/superpowers/specs/2026-07-09-employee-portal-ca-request-design.md`

## Global Constraints

- Route copy/labels exactly as specified: nav label `Cash Advance`, home card title `Cash Advance`, path `/employee/ca-form`.
- `TaxFilerBlock` must wrap `CAFormPage` (tax_filer role is banned from CA surfaces).
- Don't commit/push/deploy beyond the commits listed here; per CLAUDE.md, commits use `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (the user has been requesting commits per task in this workflow).
- No new files; no changes to `CAFormPage.tsx`, stores, or `server.js`.
- There is no unit-test harness for routes/nav in this repo (App.test.tsx is a smoke test) — the test cycle for this UI wiring is `npx tsc --noEmit` + the browser walkthrough in Task 2.

---

### Task 1: Route + nav + home card wiring

**Files:**
- Modify: `src/App.tsx` (employee-portal routes block, after the `/employee/liquidation-form` route at ~line 768–780)
- Modify: `src/components/employee/EmployeeNavList.tsx` (icon import + `items` array)
- Modify: `src/components/employee/EmployeePortalHome.tsx` (icon import + `modules` array)

**Interfaces:**
- Consumes: existing `CAFormPage` default export (`src/components/CAFormPage.tsx`), `TaxFilerBlock`/`ProtectedRoute`/`AppLayout` already defined and imported in `App.tsx`.
- Produces: route `/employee/ca-form` used by both nav item and home card.

- [ ] **Step 1: Add the route in `src/App.tsx`**

Find the employee-portal routes block (search for `path="/employee/liquidation-form"`). Immediately AFTER that `<Route …/>` element closes, insert:

```tsx
            <Route
              path="/employee/ca-form"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <TaxFilerBlock>
                      <CAFormPage />
                    </TaxFilerBlock>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
```

`CAFormPage` is already imported at the top of `App.tsx` (line ~15) — no import change needed.

- [ ] **Step 2: Add the nav item in `src/components/employee/EmployeeNavList.tsx`**

Add `Payments as PaymentsIcon` to the existing `@mui/icons-material` import:

```tsx
import {
  Home as HomeIcon,
  CalendarMonth as CalendarIcon,
  Receipt as ReceiptIcon,
  QrCode2 as QrCodeIcon,
  DescriptionOutlined as PayslipIcon,
  Assignment as ReportIcon,
  Payments as PaymentsIcon,
} from '@mui/icons-material';
```

In the `items` array, after the Liquidation entry, add:

```tsx
    { label: 'Cash Advance', icon: <PaymentsIcon />, path: '/employee/ca-form' },
```

- [ ] **Step 3: Add the home card in `src/components/employee/EmployeePortalHome.tsx`**

Add `Payments as PaymentsIcon` to the existing `@mui/icons-material` import:

```tsx
import {
  CalendarMonth as CalendarIcon,
  Receipt as ReceiptIcon,
  DescriptionOutlined as PayslipIcon,
  Assignment as ReportIcon,
  Payments as PaymentsIcon,
} from '@mui/icons-material';
```

In the `modules` array, after the `Expense Liquidation` entry, add:

```tsx
    {
      title: 'Cash Advance',
      description: 'Request a cash advance and track its approval status and balance.',
      icon: <PaymentsIcon sx={{ color: NET_PACIFIC_COLORS.primary, fontSize: 28 }} />,
      path: '/employee/ca-form',
    },
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no output (clean). If `Payments` is not exported by the installed `@mui/icons-material`, use `Paid as PaidIcon` instead in both files (same pattern).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/employee/EmployeeNavList.tsx src/components/employee/EmployeePortalHome.tsx
git commit -m "feat(employee): add Cash Advance request entry to the employee portal

Reuse the role-aware CAFormPage at /employee/ca-form (same pattern as the
portal's Liquidation entry): route wrapped in TaxFilerBlock, sidebar nav
item, and a portal-home card. No server/store/page changes — the page
already scopes non-admins to their own CA balance and requests.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Browser verification on the mock API

**Files:**
- Create: mock server script in the session scratchpad (NOT in the repo), e.g. `<scratchpad>/mock-api.js`
- No repo files modified by this task.

**Interfaces:**
- Consumes: route `/employee/ca-form` from Task 1; repo-local skill `.claude/skills/verify/SKILL.md` (client on 3000 via preview tools' `pmv2-client` launch config; mock express API on 3001).
- Produces: verification evidence (snapshots/screenshot) — nothing consumed downstream.

- [ ] **Step 1: Start the client and a mock API per the repo `verify` skill**

Start `pmv2-client` with the preview tools. Write the mock with the repo's own express (`require('/Users/tjc/PM/pmv2/node_modules/express')`), run in background on 3001. It must implement (per the skill: CORS with origin echo + credentials + `Content-Type,Authorization` headers, 204 OPTIONS):

- `POST /api/auth/login` → `{ success: true, user: { id: 'u1', username: 'emp', full_name: 'Test Employee', role: 'user' }, token: 't' }`
- `GET /api/auth/me` → `{ success: true, user: <same user> }`
- `GET /api/cash-advances` → `{ success: true, cash_advances: [] }` initially; after a POST, include the created row.
- `POST /api/cash-advances` → store and return `{ success: true, cash_advance: { id: 'ca1', ca_no: 'CA-0001', user_id: 'u1', amount: <body.amount>, balance_remaining: 0, status: 'pending', purpose: <body.purpose>, project_id: <body.projectId ?? null>, requested_at: <epoch-seconds>, created_at: <epoch-seconds> } }`
- Check `CAFormPage`'s fetch paths before writing the mock (`grep -n "fetch(" src/components/CAFormPage.tsx`) and mock any other GET it fires on mount (e.g. projects or users lists) with empty-success shapes so the page doesn't error.

- [ ] **Step 2: Log in and walk the flow**

1. Fill `#login-username` / `#login-password`, click `button[type="submit"]`.
2. `location.href = 'http://localhost:3000/employee'` → snapshot: portal home shows a **Cash Advance** card with the description copy.
3. Click its **Open** button → URL is `/employee/ca-form`, sidebar **Cash Advance** item is highlighted, page shows "Your Cash Advance Balance" and "My CA requests" (NOT the admin "Cash Advance Balances by Employee").
4. Submit a CA request through the form (amount + purpose) → row appears in "My CA requests" with status `pending`.

- [ ] **Step 3: Confirm no console/network errors**

Check preview console logs (error level) and failed network requests — the only acceptable failures are endpoints the verify skill lists as optionally-404 (`/api/users/staff-contacts`, `/api/calcsheet/settings`) if the page happens to touch shared stores.

- [ ] **Step 4: Share proof**

Take a screenshot of the portal home (card visible) and of `/employee/ca-form` after the submitted request appears. Report results to the user; no commit (nothing in-repo changed).

---

## Self-review notes

- Spec coverage: route (Task 1 Step 1), nav (Step 2), card (Step 3), tsc + browser walkthrough (Task 1 Step 4 + Task 2) — all spec sections covered; "no server/store/page changes" honored (no such edits planned).
- Type consistency: only shared identifier across tasks is the `/employee/ca-form` path — consistent everywhere.
- tax_filer redirect: guarded by reusing `TaxFilerBlock` exactly as the other two `ca-form` routes; not separately browser-tested (would need a second mock user; the guard is a one-line role check already exercised by existing routes).
