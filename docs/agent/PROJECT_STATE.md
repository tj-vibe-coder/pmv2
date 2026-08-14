# Project State

Updated: 2026-08-14

## Current status

- Finance Money Trail is complete on branch `feat/finance-money-trail` and has not been merged or deployed.
- Investment Tracker, project/overhead expenses, liquidation rows, cash advances, and reimbursements now expose confirmed cross-record trails and exact-record deep links.
- Possible duplicates use deterministic review signals (including centavo/small-peso differences), remain separate from confirmed links, and can only be resolved by admins.
- Confirmed investment-expense links can be reviewed again to unlink, keep one record, or reclassify a retained investment; source-owned synced expenses remain protected and redirect reviewers to their source.
- Resolver mutations are transactional and write append-only `finance_trace_audit` records with actor, reason, request ID, and before/after snapshots.
- Calcsheet quotation-history pricing is complete and committed through `3344577`.
- Add Product keeps managed **Pricelists** separate from read-only **Quotation History**.
- Historical product search, provenance display, expected-purchase-date handling, and contingency suggestions are implemented across the Express API and React UI.
- Server integrity checks reject unrelated or blank confirmed candidates and invalid/pre-quotation purchase dates.
- Customer PDF/XLSX exports do not include internal historical pricing snapshots.

## Verification

- Finance trace server and packaging suite: 63/63 passing.
- Frontend suite: 126/126 passing.
- TypeScript and production build passing for the money-trail branch.
- No production write tests or live Firestore mutations were used during verification.
- Server product-history tests: 36/36 passing.
- Frontend tests: 73/73 passing.
- TypeScript and production build passing.
- Local Firestore-emulator search, suggestion, validation, and browser smoke passed.
- Independent final review verdict: READY.

## Current blockers

- None for Finance Money Trail implementation.

## Next considerations

- Review and merge `feat/finance-money-trail` independently from the AI receipt-assist work when requested.
- Run a browser smoke against a safe Firestore emulator dataset before deployment; automated integration coverage and the production build are already green.
- Deploy or merge according to the repository branch workflow when requested.
- Consider improving the insufficient-history panel to show excluded evidence reasons; this is explanatory polish, not a correctness blocker.
