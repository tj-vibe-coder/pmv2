# Finance supporting documents and payment evidence — implementation plan

Date: 2026-10-14
Status: Phases 0–2 local implementation authorized via RJ’s Tab 4 handoff and built on 2026-10-14; production capability inventory, real-emulator/OneDrive validation and deployment remain pending. Phases 3–5 remain separate releases.

## Outcome

Review all evidence for an invoice, payment, cash advance, reimbursement, investment or expense from its record; identify missing links without implying the underlying document does not exist; preserve financial balances and historical evidence.

Recommended delivery: six focused phases, each with a reviewable change and explicit acceptance checks. Ship document handling before changing collections accounting.

## Evidence and current implementation

The October 14 audit reports 97/161 project expenses without receipt links (154,117.09), 10 non-payroll overhead gaps (41,607.05), 15 payroll overhead rows, 10 CAs without direct disbursement proof, and 42 investment entries without dedicated payment proof. These are dated audit results, not a newly verified live baseline. A missing link does not establish that a document is absent elsewhere. Do not add liquidation totals to their synced expense totals.

Source files:

- `/Users/reuelrivera/IOCT CoWork/IOCT Finance/Invoice/audit/oct14/finance-support-review.md`
- `/Users/reuelrivera/IOCT CoWork/IOCT Finance/Invoice/audit/oct14/missing-support-records.csv`
- `/Users/reuelrivera/IOCT CoWork/IOCT Finance/docs/agent/memory/log/2026-10-14-finance-scans-records-and-support-audit.md`

Verified against current repository code:

| Area | Current behavior / implication |
| --- | --- |
| Invoice attachments | `src/types/Invoice.ts` exposes one `scan_file`; `CollectionsDashboard.tsx` uploads and overwrites that field. Keep it readable throughout migration. |
| EWT register | `SalesEwtRegisterPage.tsx` renders `wht_2307_ref` as plain text; certificate status and actual WHT already exist separately. |
| Collections | UI replaces cumulative `amount_collected` and `collection_date` through invoice PUT. No first-class invoice payment/allocation ledger was found in that path. |
| Reimbursements | `ReimbursementDashboard.tsx` and local `server.js` already support payment proof, per-line payments, and transfers across claims using `reimbursement_payments` and `transferId`. Reuse these features. |
| API parity | Checked-in `functions/server.js` has older whole-form reimbursement handlers and lacks the local `pay-lines`, `pay-lines-batch`, and `proofRef` implementation. Production capability needs separate verification; do not assume local behavior is deployed. |
| Navigation | Finance Money Trail already resolves expense, liquidation-row, CA, investment and reimbursement origins. Invoice/payment/payroll origins need explicit extensions or dedicated focus links. |

Reviewed PRD, architecture overview, Money Trail design, existing liquidation/reimbursement plan, and Graphify's InvestmentTracker map. Graphify coverage is older/incomplete for Collections; current code governs. The October 5 improvement plan contains items now implemented locally and must not be used as an unchanged backlog.

## Rules that apply to every phase

- Document attachment and classification do not create payments, change invoice amounts, change WHT, or settle balances.
- Keep cash, recognized WHT, and certificate evidence distinct. Existing AR settlement remains cash plus recognized WHT; uploading a certificate does not recognize WHT again.
- Counter receipt = billing acknowledgement. Deposit evidence does not establish cheque clearance. Unknown dates remain unknown.
- Reuse OneDrive upload/view services, existing project Documents, receipt references and reimbursement proof records. Store one file once and link it to multiple records where appropriate.
- Keep original scans, document packs, historical notes and legacy IDs. Classify existing packs as supporting packs until their contents are explicitly linked; do not call a pack a standalone Service Invoice or 2307 automatically.
- Preserve role restrictions, especially tax-filer scope and payroll access. Enforce authorization on APIs and attachment downloads/links as applicable, not only buttons.
- Record actor/time, source, corrections and unlink reasons. Unlinking evidence does not delete the original OneDrive file. Adding links must tolerate retries and concurrent edits.

## Phase 0 — Establish the baseline and API parity

1. Compare relevant finance routes in `server.js` and `functions/server.js`; inventory deployed endpoints without modifying production records.
2. Preserve/reuse existing reimbursement ledger and proof semantics. Bring missing handlers into parity as a focused, tested change before shipping dependent UI.
3. Capture authorized pre-release snapshots and totals, including legacy scans, invoice cash/WHT, reimbursement paid amounts, CA balances and investment links.
4. Write the schema ADR and versioned migration design before adding fields/collections. Proposed structures below remain draft until then.

Acceptance: endpoint contract tests pass against both API copies; paid history and funding sync behavior stay unchanged; production/local capability differences are documented. No broad server overwrite to obtain parity.

## Phase 1 — Shared typed documents, starting with invoices

Build a reusable Documents panel with upload, link-existing, view, type, reference/date, source, and link history. Start in Collections, covering Service Invoice, IOCT Collection Receipt, customer Counter Receipt, BIR 2307, payment proof, bank deposit slip and supporting pack. Allow multiple files per type.

Proposed model: `finance_documents` stores stable document identity and OneDrive drive/item IDs, HTTPS URL, filename, MIME/size, upload provenance and optional hash. `finance_document_links` associates a document with an allowlisted entity and evidence type. One document may serve several records; evidence type belongs to the relationship. Reference foreign records server-side and use deterministic link identity to avoid retry duplicates. Legacy adapters expose `scan_file`, `receiptRef`, `proofRef`, and project Documents without duplicating bytes. Existing HTTPS-only references remain supported with explicit provenance.

Do not introduce a second file-storage system. Validate file types/size and URLs; handle successful upload followed by failed linking with a retry/recovery path. Concurrent attachment additions must append safely, not replace an entire stale array.

Acceptance: adding a collection receipt preserves the existing invoice scan; legacy packs still open; the same slip can appear on three invoices with one stored file; metadata edits leave financial totals unchanged; unauthorized reads/writes fail server-side.

## Phase 2 — BIR 2307 evidence and reconciliation

Extend the EWT register with upload/link/view using Phase 1. Store certificate number, period start/end, printed income base, printed WHT, printed ATC/description, and review flags separately from booked `wht_amount` and assumed rates. Support a certificate covering multiple invoices with explicit evidence allocations; allocated certificate WHT must reconcile without creating cash or double-recognizing tax credit.

Show document availability independently from historical received/expected flags. Retain received history even when its direct link needs repair. Review states: unreviewed, matched, discrepancy, resolved; resolution requires a note and retains the previous evidence.

Acceptance examples from the audit:

- SI008 retains actual WHT 7,736.56 and printed income base 172,691.13; flag the base/rate mismatch without recalculating settlement.
- SI011/012/013 retain actual WHT 5,357.14 / 3,214.29 / 535.71 and documented printed bases. Record the observed sales / 1.12 × 2% calculation as evidence, without changing IOCT sales or non-VAT status.
- Goods/WC158 versus engineering descriptions remains visible for all four certificates. This feature records discrepancies; it does not determine the correct tax treatment.
- Remaining expected certificates total 3,611.58 in the dated baseline. Linking documents alone does not change recognized WHT or mark unrelated certificates received.

## Phase 3 — Invoice payments, allocation and banking events

Introduce a dedicated incoming-payment ledger (proposed `collection_payments`) with cash amount in centavos, counterparty, method/reference, received date, optional deposited/cleared dates, status and linked evidence. Keep outgoing reimbursement payments in their existing ledger.

Store allocations as invoice ID + cash amount in centavos. Support partial payments, several payments per invoice and one payment across invoices. Validate distinct invoices/counterparty compatibility, positive allocations, available invoice cash due, and allocation total <= payment total. Display unallocated cash explicitly. Use transactions and idempotency keys; edits/reversals retain history and reconcile every affected invoice. Clearance is a separate event; bounced/voided payment handling must explicitly reverse affected cash allocations rather than just hide a document.

Continue publishing existing invoice cash/date fields as transactionally maintained projections for dashboards and exports. During transition, the UI's legacy cumulative collection edits must be disabled or translated into an audited payment adjustment for migrated invoices; generic invoice PUT must not bypass allocation ownership. Preserve current last/full-collection date semantics until explicitly defined in the ADR.

Acceptance:

- One payment of 500,892.86 allocates 294,642.86 / 176,785.71 / 29,464.29 to SI011/012/013. It counts once in cash inflow, and its one shared deposit slip opens from all three invoices.
- WHT 9,107.14 remains separate; cash + WHT settles 510,000.00 without creating extra revenue.
- SI008 retains received date Sept 10 and deposit date Sept 15; no invented clearance date.
- SI010's counter receipt changes no cash balance and leaves it unpaid.
- Retry, concurrent allocation, partial collection and reversal tests cannot over-allocate or double-count. Invoice totals, settled ledger, exports and any financial summaries reconcile to the same source.

## Phase 4 — Outgoing funding and payroll evidence

Add payment-proof/reference/date handling to CA disbursement and Investment Tracker using the shared Documents panel. Distinguish approval from confirmed disbursement; existing approved CAs with uncertain disbursement state become review cases, not automatically confirmed transfers. Pending requests have no overdue payment-proof requirement before disbursement.

Expose existing reimbursement proof and shared transfer relationships; add after-the-fact link repair without recording another payment. Link investment/funding mirrors to the original payment evidence while retaining expense receipt relationships. A supplier receipt must not satisfy an investor-funding proof requirement.

For payroll-synced expenses, follow `sourceRunId` to payroll-run/payment support, under existing payroll permissions. Show restricted-support status to users without access rather than leaking payroll files or mislabeling them missing. Reuse payment identities when a real transfer funds several records; do not create duplicate ledger cash movements just to attach evidence.

Acceptance: attaching proof changes no CA balance/investment amount/reimbursement paid total; one reimbursement transfer's evidence is reusable across its claims; pending CA rules and payroll access are tested; historical paid claims remain fully paid.

## Phase 5 — Missing-support review and historical reconciliation

Add a Finance Supporting Documents view with module, project/person, date, evidence type, source and state filters, exact record links, distinct-record/amount summaries and CSV export. Use a server-owned rule registry to determine expected document types by record lifecycle/source.

States per requirement: expected, available-unlinked, received, not-applicable. Available-unlinked requires an identified candidate document and reviewer confirmation before linking; filename similarity alone is insufficient. Not-applicable requires an authorized reason/history. Show evidence discrepancy/review flags separately from availability. Non-disbursed CAs may show proof as not-yet-due.

Resolve explicit source links before declaring gaps: liquidation-row receipts, expense receipts, reimbursement payment proofs, project Documents and payroll-run evidence. Preserve canonical source identity in summaries so source liquidation and synced expense mirrors do not inflate missing amounts. Apply permission filters before returning rows, files or totals. Use pagination/bounded queries; avoid expanding the Money Trail's existing whole-collection read-cost issue into every page load.

Acceptance: reproduce/explain the dated CSV baseline using fixture snapshots; distinguish missing link from missing document; payroll never defaults to supplier-receipt missing; links select the exact record; restricted records do not leak through counts or export. Candidate matching never silently links or marks evidence received.

## Migration and rollout

- Prepare versioned, dry-run-first, idempotent scripts for every schema change; include source preconditions, manifest, before/after values, reconciliation and compensating rollback.
- Preserve `scan_file` and adapters until every reader/export is covered. Backfill links using stable OneDrive identity; never re-upload originals or discard previous scan references.
- Do not synthesize separate historical payments from cumulative cash unless dates/allocations are supported. Use explicitly labeled opening allocations for unidentified history, or leave it in legacy mode until reviewed. Reconcile opening + new allocations to existing invoice cash exactly; opening records must not count as new-period cash inflow.
- Reconstruct the Oct 14 shared payment only from the audited evidence and confirmed invoice IDs; require previewed before/after totals. Import the CSV as a dated review queue, not automatic missing-document verdicts.
- Test on emulator/fixtures; release document phases first, then collections ledger, then remaining modules and review dashboard. Stage production migration/deployment separately after the implementation is reviewable.
- Update PRD, DATA_MODEL and ADRs as scope/design is finalized; update TASK_LOG, PROJECT_STATE and KNOWN_ISSUES throughout implementation.

## Checks required during implementation

Run targeted UI/API tests, `npx tsc --noEmit`, focused ESLint, `npm run build`, migration dry-run/rerun checks, API-copy parity checks and browser review. Cover authorization, upload/link recovery, concurrent appends, allocations/reversals, legacy visibility, and unchanged balances. Reuse existing invoice WHT and finance-trace tests. No new dependencies are assumed.

## Scope boundaries and decisions to confirm before dependent coding

Recommended first release: Phases 0–2, giving typed invoice documents and usable 2307 evidence with no collections accounting rewrite. Phases 3–5 follow as separate releases.

RJ decisions: who can upload/classify/waive evidence in each module; whether missing proof is advisory or blocks a confirmed disbursement (default recommendation: advisory with explicit review); how unmatched historical cash is presented; who resolves certificate discrepancies; whether payroll view links expose only proof or the full run (default: existing payroll access only).

Excluded: rewriting tax rates, tax filing automation, creating SI009 without identity evidence, duplicating historical SI001 revenue, changing original contract amounts, unexplained write-offs, full bank reconciliation/OCR, new scoped automation credentials, and the unrelated CA closure/reopen redesign. Keep the October 5 plan as separate context and reconcile overlapping items when implementation begins.

## First release implementation — 2026-10-14

- Focused reimbursement route/funding-category parity implemented in both checked-in API copies, with contract tests against both. No broad server copy or deployment performed. Live deployed capabilities are still unverified.
- Shared invoice Documents panel replaces the single-scan upload action and retains legacy scan views. Documents have stable file identity, deterministic invoice/type links, revision checks and actor/time history. Upload recovery retains OneDrive metadata in browser-tab storage; new upload filenames are unique.
- EWT register opens the same panel for standalone 2307 linking/review. Printed certificate amounts, periods, ATC/description, observed calculation, flags and multi-invoice evidence allocations remain independent of booked WHT and historical received/expected flags.
- Permissions and schema are specified in ADR-0002; migration 001 is offline/dry-run-first with emulator-only apply/rollback. Invoice-only adapters are enabled; outgoing/payroll adapters follow in Phase 4.
- Automated API, UI, transaction/migration fixture and accounting-regression checks pass. Real Firestore emulator requires unavailable Java/Firebase CLI. Authenticated browser and real OneDrive validation remain release gates; fixture preview navigation on port 3300 was blocked by the CUI origin allowlist.
- Shared incoming-payment accounting, separate received/deposit/clearance dates, outgoing/payroll support and missing-support dashboard remain Phases 3–5. The first release links shared slips as evidence only.
