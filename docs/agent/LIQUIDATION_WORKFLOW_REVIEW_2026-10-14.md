# Independent liquidation receipt workflow review — 2026-10-14

Scope: staff physical handover → RJ possession/receipt review → payment/documentary closure; urgent exceptions; independent payment history; top alignment. Reviewed product workflow, ADR-0003/0004, migration README, code and tests. Result: main workflows and automated suites pass; two additional P2 findings remain. This is a local review, not production release approval.

## Findings

### W1 — P2: unknown settlement information can be treated as settled and closed

Location: `server/liquidationWorkflow.js:18–20`.

Reproduced through the real receipt-review router with an isolated `FinanceFirestore` instance:

1. Seed a submitted liquidation owned by staff, with total 100, one expense row and no reimbursement document. Omit `ca_id`, `reimbursable_amount` and `reimbursement_status`, representing unknown settlement provenance.
2. STAFF records physical submission with the current fingerprint/revision and date 2026-10-01: HTTP 200.
3. RJR records review with both confirmations, current fingerprint/revision and date 2026-10-01: HTTP 200.
4. GET receipt-review returns `workflowStatus: closed`.

Expected under ADR-0004: missing settlement information remains an open review case. The final fallback interprets absent, null or nonnumeric reimbursable amount like zero. It therefore cannot distinguish known no-reimbursement-due from unknown settlement. No financial values changed in this probe; the error is premature documentary closure. This is a synthetic legacy/incomplete-record case, not a claim about affected production IDs.

Suggested correction: require positive evidence of no outstanding reimbursement before closing a form without a reimbursement document. Return `source_review_required` for unknown/inconsistent settlement metadata, while preserving legitimate CA-covered/zero-due closure and historical paid handling. Add regressions for missing/null/invalid fields and valid zero-due records, including both API bundles.

### W2 — P2: return summary hides RJ's reason and shows the original handover details

Location: `src/components/LiquidationReceiptReview.tsx`, physicalSubmission summary around line 74.

Reproduced in actual Chrome on `http://localhost:3300`:

1. STAFF submits physical copies with a nonempty note: `Independent QA: printed form and physical originals handed to RJ`.
2. RJR reviews; historical paid fixture becomes Closed.
3. RJR withdraws review with a reason, then returns copies with `Independent QA: missing original toll receipt`.
4. Main summary says `Physical copies returned · 2026-10-13 · Recorded by Fixture Employee` and displays the original handover note. The return reason is absent from the main summary.
5. Review history correctly retains the return reason and RJR actor/recording time.

Expected: returned status prominently displays the return reason and distinguishes original submission date/actor from the return event. Current expression chooses `physicalSubmission.note || physicalSubmission.returnReason`, hiding the correction instruction whenever staff supplied a note. The accompanying date/actor remain those of the handover, which can be mistaken for the return event.

Suggested correction: render submission and return details explicitly; select returnReason for returned state, retain original handover context separately, and show actual return actor/time. Keep history. Add a UI regression with both a handover note and a return reason.

## Actual Chrome checks

Only the isolated fixture origin was used for writes. Restarted `server/test-support/financeEvidencePreview.js` to load the implementation; reset its in-memory state once to test the urgent and normal payment paths independently. No Firebase or Graph initialization. Browser actions used RJ-authorized AppleScript DOM interactions in the tab whose URL starts `http://localhost:3300/`; other browser sessions were untouched. Test account switching used the fixture login endpoint and its returned fixture-only session, without reading production credentials.

Passed:

- STAFF opens their paid submitted form through `/employee/liquidation-form`; cannot see RJ-review actions. Handover save requires confirmation. Actual handover date 2026-10-13, actor and note persist; state becomes Submitted to RJ — awaiting review.
- OTHER admin cannot see RJ review or return actions. API tests also enforce RJ-only writes and owner restrictions.
- RJR review requires physical-possession and full completeness/date/amount/particulars checkboxes. Paid historical fixture becomes Closed after review; paid state is retained.
- Normal payout before review is rejected with the review/urgent-reason error; readback confirms claim stays pending and no payment ledger entries were created.
- Urgent payout with reason succeeds once. Claim remains Paid/Open, zero cash due, row selection disabled, no Pay action. Payment history shows the urgency reason; API ledger retains payment actor/time. No real proof upload was attempted.
- RJR withdrawal reopens follow-up while retaining reimbursed status. Return moves it to Awaiting physical receipts, with history retaining submission/review/withdrawal/return events. W2 concerns its main summary.
- In a fresh fixture run, STAFF handover and RJR review on the unpaid form yield RJ reviewed — awaiting payment, not Closed. Normal payout with blank urgent reason then succeeds; claim becomes Closed, paymentException is null, and cash due is zero.
- Actual Open, Closed and All dropdown views correctly show paid-but-open and paid-closed records. All paid rows are unselectable for payout; summary cash due is zero after full payment.
- Visual screenshot confirms PO, Particulars, Amount, Remarks, Supplier and Invoice controls share a top edge. DOM inspection found every itemized cell `vertical-align: top`; all input roots had identical top coordinates beside the taller Particulars field. Horizontal table scrolling remains available.

## Automated and isolated checks

- `node --test server/liquidationReceiptReview.test.js server/reimbursementParity.test.js server/reimbursementSettlement.test.js server/financeEvidence.test.js server/financeEvidenceUpload.test.js server/cashAdvanceEditing.test.js server/financeTrace.test.js server/financeTraceRouter.test.js server/financeTracePackaging.test.js` — **92 passed** independently.
- `CI=true npm test -- --watchAll=false --runInBand src/components/LiquidationReceiptReview.test.tsx src/components/ReimbursementDashboard.workflow.test.tsx src/components/finance/InvoiceDocumentsPanel.test.tsx src/types/Invoice.wht.test.ts` — **20 passed** independently.
- `npx tsc --noEmit` — passed.
- Focused ESLint on liquidation form/review, reimbursement dashboard and their workflow tests — passed.
- `node --check server.js`, `node --check functions/server.js`, `git diff --check` — passed.
- `npm run build` — passed independently; existing Browserslist, fs.F_OK and bundle-size notices remain.
- Additional isolated simultaneous line/remaining/batch payment probe, both API copies: statuses 200/400/200, exactly one ledger entry for 100 and one funding sync. The successful batch with zero payable records only skipped the already-paid claim; it did not pay twice. Real Firestore concurrency is not validated by this serial transaction fixture.
- Existing fixture suites cover changed form/receipt hashes, pending revisions, stale reviews/retries, invalid/future/backdated review dates, role/owner guards, proofRef/shared transfer IDs, legacy normal/urgent status history, migration 003 no-op, and CA-excess restoration of only the unpaid amount. These are automated-fixture results, not all separate browser scenarios.

Local logs/screenshots: `/tmp/ioct-workflow-*`. The preview remains available on port 3300 with fixture-only data. No implementation changes made by this review; Tab 4 owns corrections.

## Remaining gates

Correct W1/W2 and recheck affected flows. Real Firestore emulator/transaction behavior, real OneDrive upload/proof recovery, deployed endpoint capability and production baseline reconciliation remain unverified. No production/OneDrive mutations, new schema operations or deployment performed. Automated suite success does not close the additional findings above.

## Build-owner follow-up (Tab 4, 2026-10-14)

W1/W2 were verified and corrected locally after the independent review. W1 now preserves unknown/inconsistent settlement as an open source-review case and requires explicit paid or zero-due accounting provenance for closure without a reimbursement document. Public-router regressions cover the original STAFF→RJ unknown-source reproduction and missing/null/blank/non-numeric/negative/inconsistent inputs, valid zero/CA-covered cases and historical paid handling in both API variants.

W2 now prominently renders the return reason, authenticated returner name (recorded actor ID for older events) and actual return timestamp, with original handover details labeled separately. The return endpoint captures a name snapshot going forward; existing history is retained. UI regressions cover both a nonempty handover note and return reason, distinct actors/dates and older ID-only return events.

96 Node and 22 React/WHT tests pass in the build-owner run. These local fixes/automated checks do not constitute independent closure of findings; focused recheck and real-service gates remain pending. No production/OneDrive mutations or deployment.

## Independent correction recheck — 2026-10-15

W1 and W2 pass independent local recheck. Original findings above remain as historical reproduction evidence.

- W1: reran the original public-router STAFF submission → RJR review scenario with missing settlement metadata. Both writes return 200, workflow now returns `source_review_required`, and liquidation financial/source records remain unchanged.
- Independent settlement controls pass: missing/null/blank/nonnumeric/negative reimbursable metadata and zero without provenance stay source-review cases; explicit zero total and fully recorded matching CA coverage close; inconsistent CA coverage stays open; positive/pending liability awaits payment; explicit historical reimbursed/paid records remain closed after current physical/RJ review. Both API regression variants pass.
- W2: restarted only the isolated preview and used actual Chrome at localhost:3300. STAFF submitted with a nonempty handover note dated October 13. RJR returned copies with a distinct reason. The summary visibly shows `Return reason`, `Returned by: Fixture RJ` and actual October 15 return timestamp, followed by separately labeled `Original handover to RJ`/Fixture Employee and `Handover note`. Screenshot `/tmp/ioct-workflow-recheck-return.png` confirms the presentation.
- Fixture API readback confirms authenticated `returnedBy`, `returnedByName`, `returnedAt` and reason; history retains physical_submit/Fixture Employee and physical_return/Fixture RJ. The paid fixture remains paid for 3,000, and the unpaid control remains pending for 1,500; return causes no payment or balance change. Older ID-only return fallback passes the UI regression suite; no production history was edited to simulate it.
- Independently reran **96 Node tests and 22 React/WHT tests**, all passing. TypeScript, focused review component/test ESLint, both API syntax checks and diff check pass. Production build was not repeated for this focused recheck; corrected build is reported passing by the build owner, and its updated static output was exercised in Chrome.

The two findings are closed for local fixture behavior. No implementation changes made during recheck. Real Firestore emulator/transaction behavior, real OneDrive integration, deployed endpoint parity and a fresh production baseline remain release gates. No production/OneDrive mutations or deployment performed.
