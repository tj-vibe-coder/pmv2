# Cash Advance requests in the employee portal — Design

**Date**: 2026-07-09
**Status**: Approved by TJ (brainstorming session)
**Scope**: Employee portal (`/employee/*`)

## Problem

Employees (role `user`/`viewer`) are confined to the employee portal, which has no way
to request a Cash Advance or track one — CA requests live only on the finance/expense
workspaces' `ca-form` routes, which `EmployeeGuard` redirects employees away from.

## Decision

Reuse the existing `CAFormPage` in the portal, exactly like the portal's Liquidation
entry reuses `LiquidationFormPage`. No new page: `CAFormPage` is already role-aware
(non-admins see "Your Cash Advance Balance", "My CA requests", the request form, and
can cancel their own pending requests) and `GET /api/cash-advances` already scopes
results to the requesting user for non-privileged roles.

Rejected alternative: a simplified employee-only CA page — cleaner surface but a
second CA UI to maintain, and the existing page already renders a scoped employee view.

## Changes (3 files, no server/store/page changes)

1. **`src/App.tsx`** — add route `/employee/ca-form` rendering
   `<ProtectedRoute><AppLayout><TaxFilerBlock><CAFormPage /></TaxFilerBlock></AppLayout></ProtectedRoute>`,
   next to the existing `/employee/liquidation-form` route. `TaxFilerBlock` keeps the
   `tax_filer` role off CA surfaces, consistent with the other two `ca-form` routes.
2. **`src/components/employee/EmployeeNavList.tsx`** — add
   `{ label: 'Cash Advance', icon: <PaymentsIcon />, path: '/employee/ca-form' }`
   after the Liquidation item (`Payments` icon from `@mui/icons-material`).
3. **`src/components/employee/EmployeePortalHome.tsx`** — add a "Cash Advance" card
   (copy: request a cash advance and track its approval status and balance) linking
   to `/employee/ca-form`, following the existing card structure.

## Error handling

None new — `CAFormPage` already handles fetch/submit errors; routes are guarded the
same way as the portal's existing Liquidation entry.

## Verification

- `npx tsc --noEmit` clean.
- Browser walkthrough on TJ's machine per the repo `verify` skill (client + mock API
  on 3001, mocking `/api/cash-advances` GET/POST): portal home shows the card, nav
  item highlights on the route, submitting a request lands in "My CA requests",
  tax_filer redirect unaffected.

## Out of scope

- Any change to CA approval flow, funding, or liquidation linkage.
- Simplified employee-specific CA UI.
