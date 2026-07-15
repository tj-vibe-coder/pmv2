# CA Form Page — Design System Retrofit

**Date**: 2026-07-10
**Status**: Approved by TJ
**Scope**: `src/components/CAFormPage.tsx` only. Visual/structural only — no behavior, data, or endpoint changes.

## Problem

`CAFormPage.tsx` predates `docs/DESIGN_PHILOSOPHY.md` and doesn't follow it: `h5` colored title
instead of `h4`, a local ad-hoc `theme = {primary, secondary}` const instead of the canonical
`NET_PACIFIC_COLORS`, plain bordered `Paper`s instead of the documented patterns, the employee
balance summary rendered as a table instead of KPI cards, non-sticky tables without the standard
font sizes/alternating rows, and inconsistent dialog styling. Same category of gap as the
Payroll module (tracked separately in CLAUDE.md §5 item 18) — this fixes CAFormPage only.

## Changes

1. **Colors**: replace the local `theme` const with the canonical `NET_PACIFIC_COLORS` object
   (primary, secondary, accent1, success, warning, error, info) copied per convention.
2. **Title**: `h5` → `h4`, `component="h1"`, `fontWeight: 600`, default color (drop the
   `color: theme.primary` override) — per §4/§12.
3. **Balance summary** (`visibleEmployeeBalances` section):
   - Employee (non-admin) view: replace the single-row table with 4 gradient KPI `Card`s
     (`Grid size={{xs:6, sm:3}}`) — Approved CAs (blue/primary), Total Approved (blue-purple/info),
     Holds Unliquidated (yellow/warning, dark text), Company Owes (green if the value is `—`/0,
     red if the company owes a positive amount) — per §5.
   - Admin view (per-employee rows): stays a table (doesn't fit the KPI-card shape), but gets the
     standard table styling from item 4 below.
4. **Table styling** (breakdown table, admin balances table, CA list table):
   - Header cells: `fontWeight: 600, fontSize: '0.875rem'` per §7d.
   - Body cells: `fontSize: '0.8rem'` per §7e.
   - `stickyHeader` + alternating rows via `&:nth-of-type(odd)` (`rgba(0,0,0,0.02)`), not manual
     `idx % 2`, on the CA list and admin balances tables. The breakdown table (max 1 header row
     visible in a short editable grid) keeps `size="small"` but doesn't need `stickyHeader` — it's
     never tall enough to scroll.
   - CA list `TableContainer`: add `maxHeight: 'calc(100vh - 480px)'` so the table scrolls
     internally per §7c, consistent with the rest of the app.
5. **Section Papers**: the "Request Cash Advance" form Paper and the CA-list Paper adopt the
   gradient-header pattern from §8 (`background: linear-gradient(135deg, #fff 0%, #f8fafc 100%)`,
   `border: 1px solid #e2e8f0`, section title in a bordered header `Box` colored
   `NET_PACIFIC_COLORS.primary`) instead of ad hoc `border: '1px solid #e0e0e0'`.
6. **Dialogs**: add `sx={{ fontWeight: 600 }}` to all three `DialogTitle`s; standardize all three
   `DialogActions` to `sx={{ px: 3, pb: 2 }}` — per §11.
7. **Root**: `Box sx={{ p: 3, width: '100%' }}` → this page is form-heavy and taller than one
   viewport (form + balance summary + full CA list), so unlike a single-table dashboard it keeps
   page-level scrolling rather than `overflow: 'hidden'`. Root becomes
   `Box sx={{ height: '100%', overflow: 'auto', p: 3 }}` — drops the redundant `width: '100%'`
   (block-level `Box` is already full width) and gives the page an explicit scroll container
   instead of relying on `AppLayout`'s ambient scroll.
   Note (final review): under the current `AppLayout` (min-height only, no definite height) the
   `height: '100%'` resolves to auto, so this root change is declarative-only — the page still
   scrolls at document level. If `AppLayout` ever gains a definite height, this page will become
   a nested scroller by design.

## Out of scope

- No changes to data fetching, submit logic, PDF export, receipt scanning, OneDrive upload, or
  any other behavior.
- No changes to the admin approve/reject/funding-edit/close-and-settle flows beyond the styling
  in items 4 and 6.
- Payroll module redesign (separate, already tracked in CLAUDE.md §5 item 18).

## Verification

- `npx tsc --noEmit` clean.
- Browser walkthrough on the mock API (per the repo `verify` skill) as both a non-admin user
  (KPI cards render, values match previous table figures) and, if a mock admin user is easy to
  add, an admin user (balances table + full CA list still render, approve/reject still work).
- Visual check: no `theme.primary`/`theme.secondary` references remain; screenshot before/after.
