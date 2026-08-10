# Task Log

## 2026-07-24 to 2026-07-27 — Calcsheet quotation-history pricing

### Completed

- Designed and implemented a separate Quotation History source in the Calcsheet Add Product dialog while preserving Pricelists as the managed catalog.
- Derived searchable product observations from current quotations with project, quotation, date, status, cost, and quoted-price provenance.
- Added authenticated history search and contingency-suggestion endpoints.
- Added quarterly trend calculation with annualized fallback, evidence filtering, confidence reporting, and explicit Apply behavior.
- Added quotation-level and component-level expected purchase dates.
- Stored immutable historical source snapshots on selected component rows without exposing them in customer exports.
- Hardened candidate confirmation against unrelated and blank identities.
- Added strict client/server calendar validation and stale-suggestion invalidation.

### Commits

- `91dcea6` — derive product history from quotations
- `333b6a8` — harden product history observations
- `e339916` — calculate historical price contingency
- `6a91e4d` — expose product history API
- `da6d2c0` — add frontend product-history contracts
- `978b466`, `845ea6d` — add and validate purchase timing
- `bdec117`, `0e2cb4c` — build and integrate the two-tab product picker
- `d501e28`, `3344577` — final integrity hardening

### Verification

- Server: 36/36 product-history tests passed.
- Frontend: 73/73 tests passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- Live sandbox API and browser smoke passed.
- Independent final code review: READY.

## 2026-07-30 — Payroll meal allowance basis (Kim Solis package)

### Problem
Meal allowance was always per-day. TJ set Kim to 15k/mo + 1k meal intending 16k take-home with OT on basic only; system multiplied 1k × days worked.

### Done
- Added `mealAllowanceBasis: 'DAILY' | 'MONTHLY'` (default DAILY).
- Engine, Employee form, Employee list, PayslipCard, unit tests.

### Kim data (ops, after code live)
- mealAllowanceBasis=MONTHLY, mealAllowance=1000, monthlyRate=15000, SEMI_MONTHLY → 8k/cutoff.
- Recompute draft July 15 payroll run if already created.

### Checked
- `npm test -- --watchAll=false --testPathPattern=payrollEngine.test` — 19/19 pass
- `npx tsc --noEmit` — clean
