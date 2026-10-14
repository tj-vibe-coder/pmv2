# Independent finance evidence review — 2026-10-14

Reviewed Tab 4's Phases 0–2 against FINANCE_SUPPORT_PLAN, ADR-0002, API inventory and migration README. Result: existing automated checks pass, but three reproduced defects need correction. This review does not approve production release.

## Findings

### F1 — P2: rollback deletes shared documents referenced by later runtime links

Location: `scripts/migrations/001-invoice-evidence.js:55–64`; impact at `server/financeEvidenceRouter.js:30`.

Reproduction, using `FinanceFirestore` only:

1. Seed invoices A and B. A has a legacy `scan_file` pointing at `https://example.com/pack.pdf`.
2. Run `plan({invoices:[{id:'a', ...invoiceA}]})`, then `apply(db, manifest)`.
3. Through POST `/links`, link the migrated document ID to invoice B as `supporting_pack`. This succeeds with HTTP 200 and leaves immutable document metadata unchanged.
4. Run `apply(db, manifest, true)`.
5. GET `/invoices/b/documents` returns HTTP 404 `Record not found`. B's runtime link remains, but its shared `finance_documents` record was deleted.

Expected: rollback refuses or preserves documents with references outside the migration's removable link set. Financial source records were unchanged. CLI operations are currently emulator-only, so this finding concerns rollback correctness and future rollout readiness, not an observed production deletion.

Suggested fix/check: transactionally account for all references before deleting a shared document. Test a post-migration runtime link and overlapping migration batches; a rollback must never create dangling links or hide the entire invoice document list.

### F2 — P2: zeroed historical allocations make a corrected certificate impossible to mark matched

Location: `server/financeEvidenceRouter.js:93–102`.

Reproduction, against an isolated HTTP router with `FinanceFirestore`:

1. Seed invoices A and B, same ACTI counterparty, booked WHT 2.00 each. Link one BIR2307 to both.
2. Save printed WHT 4.00 and allocations A=2.00/B=2.00, review `discrepancy`: HTTP 200.
3. Correct printed WHT to 2.00 and allocations A=2.00/B=0, review `discrepancy`: HTTP 200.
4. Save the same corrected evidence with the latest document revision and review `matched`: HTTP 400 `Allocated evidence does not match booked invoice WHT`.

Expected: historical zero allocations remain for audit but do not participate in matching the current positive allocations against booked WHT. Omitting B is also disallowed by the previous-allocation retention rule, so the user cannot escape this state through the documented removal workflow. Cash/WHT records remain unchanged.

Suggested fix/check: distinguish retired zero allocations from active evidence when validating matched status and counterparty constraints; preserve their history. Add a remove-then-match regression test for both packaged API variants.

### F3 — P2: Refresh does not recover an open editor after a revision conflict

Location: `src/components/finance/InvoiceDocumentsPanel.tsx:73–78`, reference save around 101–105, Refresh at 153. Certificate editor likewise retains the object captured when it opened.

Reproduction in actual Google Chrome, fixture origin `http://localhost:3300`:

1. Sign in using fixture credentials, open EWT → 2307 documents, link fixture evidence and choose Edit reference.
2. While the draft stays open, PATCH that link through the fixture API using its current revision, simulating another reviewer.
3. Save the browser draft: `Evidence changed; reload before saving` appears, correctly rejecting stale data.
4. Click Refresh; the document list shows the newer reference.
5. Click Save reference again: the same conflict recurs. `editing.revision` remains stale although the list was reloaded.

Expected: after refresh, explicitly discard/reopen or reconcile the draft against the latest revision, without silently overwriting the other reviewer. Current workaround: Cancel edit, reopen Edit reference, then re-enter changes. This is a recovery/usability defect; the API correctly protects the newer data.

## Checks performed

| Check | Result |
| --- | --- |
| Seven Node suites: financeEvidence, financeEvidenceUpload, reimbursementParity, cashAdvanceEditing, financeTrace, financeTraceRouter, financeTracePackaging | 68/68 passed independently |
| React InvoiceDocumentsPanel and Invoice.wht suites | 10/10 passed independently |
| `npx tsc --noEmit` | Passed |
| Focused ESLint on panel, Collections, EWT, evidence/OneDrive services and evidence types | Passed |
| `npm run build` | Passed; existing Browserslist, fs.F_OK and bundle-size notices |
| `git diff --check` | Passed |
| Additional isolated HTTP/migration probes | Reproduced F1 and F2; source invoice financial records unchanged |
| Actual Chrome fixture UI | Legacy pack, standalone 2307 linking, printed values, metadata correction, link history, stale-edit conflict/refresh and allocated unlink guard exercised |

Actual browser evidence: SI008 printed income 172,691.13 and WHT 7,736.56 saved with WC158, goods description and base/rate/goods-services flags. Legacy pack remained visible. Reference/source/date correction history showed before/after values and actor. Empty unlink reason disabled confirmation; supplying a reason still correctly blocked unlinking a positively allocated certificate. SI008 cash 185,677.49, booked WHT 7,736.56, received history and collection date Sept 10 remained unchanged in fixture readback. Collections Documents entry was also opened and inspected on the settled fixture invoice.

Role enforcement, invalid files/URLs/size, shared-file/multi-invoice evidence, allocation conflicts, upload-success/link-failure recovery and reimbursement partial/remaining/proof/shared-transfer/funding-sync behavior passed the existing automated fixtures. Those are not claims of live OneDrive or multi-role browser verification. The preview contains one admin fixture invoice; the wider October 14 baseline is covered by the automated fixture suites, not newly read from production.

The CUI browser tool still rejects port 3300. With RJ's authorization to test in the actual browser, `open_preview` opened Chrome and AppleScript executed DOM interactions only in the tab whose URL began `http://localhost:3300/`. Screenshots and test logs are local temporary artifacts under `/tmp/ioct-finance-*`; no production session credentials were read or copied.

## Limits and handoff

No application fixes made by this review; Tab 4 remains build owner. No production data/OneDrive mutations or deployment. Real Firestore emulator, real OneDrive upload/recovery, authenticated production capability inspection and fresh production baseline reconciliation remain outstanding. Separate banking dates/payment accounting and Phases 3–5 were not tested as implemented features.

Recommend correcting F1–F3, adding targeted regressions, then rechecking the affected flows before release. Actual Chrome fixture review is now performed; that does not close the real service integration gates.

## Build-owner correction follow-up (Tab 4, 2026-10-14)

F1–F3 were verified against the code and corrected locally after this independent review. F1 now queries shared-document references inside the rollback transaction and retains metadata used outside the manifest (including inactive links); tests cover runtime additions and overlapping batches. F2 excludes zero allocations from booked-WHT matching/counterparty checks while retaining audit history and inactive links. F3 explicitly discards reference/certificate drafts on successful Refresh, with a visible label/notice; reopening uses current values/revisions.

Focused regressions pass for both API variants and both UI editors. These are build-owner fixes and automated checks, not an independent re-review or production release approval. Real emulator/OneDrive/deployed gates remain unchanged.

## Independent correction recheck (Tab 3, 2026-10-14)

F1–F3 now pass independent recheck in local fixtures. Original findings above describe the earlier implementation and are retained as history.

- F1: reran the original HTTP/migration probe against current source. After linking the migrated document to invoice B and rolling back A's manifest, the shared document remains, B's Documents GET returns 200, and invoice financial records remain byte-equivalent. Added suite coverage for inactive references/overlapping batches passes.
- F2: reran initial allocation A=2.00/B=2.00 → corrected A=2.00/B=0 → matched, using current router and revisions. All three writes return 200; financial invoices remain unchanged. New regressions pass in both packaged API variants.
- F3: in actual Chrome at the isolated :3300 origin, reproduced a conflict independently for the reference editor and the certificate editor by submitting a concurrent fixture API correction. Each stale save was rejected. `Refresh and discard drafts` closed the stale editor and displayed the discard notice. Reopening loaded the newer values; subsequent saves succeeded with no conflict. Fixture readback confirms reference `Final reference after refresh` and certificate `Final certificate after refresh` persisted.
- Browser accounting readback: billed 193,414.05, cash 185,677.49, WHT 7,736.56, collection date 2026-09-10, received flag and original pack unchanged. Printed base remains 172,691.13, printed WHT 7,736.56. The browser used the rebuilt static frontend and the existing fixture backend for revision-conflict checks; corrected F1/F2 logic was exercised separately in fresh isolated test/router instances.
- Independently reran seven Node suites: **74/74 passed**; panel/WHT React suites: **12/12 passed**. TypeScript and focused panel/test ESLint passed. API syntax and diff checks passed. Production build was not repeated during this targeted recheck; the build-owner reports a passing corrected build, and the prior independent build preceded these corrections.

These three findings are closed for local fixture behavior. This does not establish real Firestore transaction behavior, real OneDrive integration, deployed endpoint parity or a fresh production financial baseline. Those integration/release gates remain open; no production/OneDrive mutation or deployment was performed. No further application changes made during recheck.
