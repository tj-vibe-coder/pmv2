# Physical receipts, RJ review and closure

Date: 2026-10-14. Status: clarified by RJ and locally implemented; independent hands-on testing pending, no deployment.

## Confirmed request

Track whether physical receipt copies and the printed liquidation were submitted to RJ. RJ then checks them; a liquidation/reimbursement must not be considered closed before that review. Retain the manual receipt-review feature and top-aligned row fields. Hold the Tab 3 hands-on testing handoff until the extended workflow is ready.

## Proposed workflow

1. Online form submitted — awaiting physical receipts.
2. Physical receipts submitted to RJ — delivery date, recorded actor and optional note; awaiting RJ review.
3. RJ confirms receipt and completes the receipt-by-receipt review — current saved form version checked.
4. Closed only when required physical submission and current RJ review are complete, plus required payment/settlement under the selected policy.

Use separate workflow and payment states. Never relabel historical paid reimbursements unpaid just because their physical-document history is unknown. Do not infer historical delivery/RJ review from payment, attachment presence or the earlier generic admin review. Changed forms or withdrawn/returned receipt submissions must invalidate eligibility for closure while retaining history. No automatic cash movements, write-offs or CA close/reopen actions.

## Confirmed policy (RJ, 2026-10-14)

- Payment can happen before RJ review when urgently needed. Normal payment requires current physical submission/RJ review; earlier urgent payments require a recorded reason and leave documentary workflow open. Existing paid history is preserved.
- Staff can record physical submission; RJ confirms possession during receipt review. Only the approved RJR admin/superadmin account performs RJ review/return/withdrawal.
- Closure is derived from current physical submission/RJ review and applicable paid reimbursement status, with no separate cash movement or CA close action.

## Implementation impact verified against code

- `server/liquidationReceiptReviewRouter.js`: currently allows admin/superadmin manual reviews with no physical-submission record. Extend with actor/date/history and RJ-specific current review/closure eligibility. Use transactions and expected revisions; preserve past review events.
- `src/components/LiquidationReceiptReview.tsx`: expose physical receipt stage, submit/receive/review actions, and open/closed workflow state alongside existing reviewer/date.
- `server.js` and `functions/server.js`: existing reimbursement GET defaults to pending financial status. Paid claims awaiting receipt workflow need to remain discoverable through a reviewable open/closed query contract; do not replace payment status.
- `src/components/ReimbursementDashboard.tsx`: summaries and selection currently assume pending-only results. Paid-but-open records must show zero remaining cash due and be excluded from Pay Selected/Pay lines. Keep existing partial/proof/shared-transfer behavior.
- `src/components/LiquidationFormPage.tsx`: show workflow status when loading submitted forms, alongside independent reimbursement status. Saved form fingerprint still guards review against stale displayed contents.
- Existing CA Close & Settle endpoints move returned/write-off amounts. This extension concerns liquidation/reimbursement closure; do not reuse CA financial settlement to close documentary review.

## Verification / rollout

Test role enforcement, delivery/date/history, RJ-only review, paid-but-open visibility, payment eligibility for the chosen policy, stale edits, retry/concurrency and reopen/re-review behavior. Assert unchanged historical paid amounts, balances, proof/source links and finance totals. Test both API variants, targeted UI, versioned dry-run-first schema changes, TypeScript/lint/build and isolated browser flows. Then delegate the extended workflow to Tab 3 for hands-on testing as RJ requested.

No production mutations or deployment authorized.
