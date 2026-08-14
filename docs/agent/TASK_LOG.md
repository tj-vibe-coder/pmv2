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

## 2026-08-14 — Finance Money Trail

### Completed

- Added a derived, read-only money trail across investments, project/overhead expenses, liquidation rows, cash advances, and reimbursements.
- Added exact-record focus URLs that adjust filters and pagination, scroll to the target, retain a visible highlight, and provide Back to source/Clear focus actions.
- Added deterministic possible-match review for amount differences down to centavos and up to ₱500, dates within 14 days, matching text, project, investor/supplier, invoice, receipt, and source references.
- Kept possible matches visually and structurally separate from confirmed relationships; only investment-expense candidates are directly confirmable.
- Added admin-only transactional resolution actions: confirm match, keep both separate, keep investment/delete expense with optional reclassification, and keep expense/delete investment.
- Added reopening of confirmed investment-expense links through **Review or unlink**, covering the same separation/deletion actions without allowing duplicate confirmation.
- Protected liquidation-, PO-, payroll-, and CA-owned synced expenses from every resolver mutation and return the exact source link when correction must happen upstream.
- Added append-only `finance_trace_audit` entries with actor, reason, request ID, pair, timestamp, and accurate before/after snapshots.
- Hardened visibility so possible matches and graph traversal never expose another user's inaccessible manual finance records.
- Added packaging coverage so the Finance Functions deployment includes runtime trace modules but excludes tests.

### Commits

- `aabc516` — design Finance Money Trail
- `9103adb` — plan Finance Money Trail implementation
- `0d68a1b` through `1bae4bc` — trace contracts, API, resolver, drawer, exact-focus integrations, and module coverage
- `b491197` — harden trace visibility, resolver safety, confirmed-link unlinking, audit snapshots, and staged focus

### Verification

- `node --test server/*.test.js` — 63/63 passed.
- `npm test -- --watchAll=false` — 20 suites, 126/126 passed.
- `npx tsc --noEmit` — passed.
- `npm run build` — compiled successfully.
- `git diff --check` — passed.
- No production Firestore writes were made during implementation or verification.

### Notes

- Work is isolated on `feat/finance-money-trail`, separate from the AI receipt-assist branch, and is not merged or deployed.
- Browser QA was not run because the available local startup path can initialize default users unless it is paired with a verified Firestore emulator dataset.
- `npm ci` required a temporary cache because the user npm cache contains root-owned files; install completed without changing dependencies.
