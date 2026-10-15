# Task Log

## 2026-10-15 — Review and release candidate for liquidation numbering and finance fixes

- Consolidated local finance fixes for canonical BIR2307 upload folders/one extension, Gemini receipt crop preview, default chronological liquidation sorting, scroll chaining, expanded Particulars, and persistent row-ID physical item references across forms, receipts and exports. Separated crop model selection from the general receipt parser environment setting, so production crop detection uses the 3.5 Flash-Lite default even when receipt parsing stays on3.1; `GEMINI_CROP_MODEL` remains an explicit override. Updated direct jsPDF dependency from4.1.0 to patched4.2.1 after release audit identified a critical advisory.
- Release checks on clean `npm ci`: 165 Node tests and566 React tests pass; TypeScript and focused ESLint pass with existing warnings; optimized production build and Functions packaging pass. `npm audit --omit=dev` still reports five critical transitive findings and132 total on the existing dependency tree; four criticals have nonbreaking fixes but are inherited, while `tar` currently suggests a major sqlite3 update. The direct jsPDF critical is fixed. This audit baseline is documented for review; no broad dependency rewrite included.
- Tab3’s actual production validation for LQ016 is complete: all27 baseline references frozen; physical Item7 remains Item7 after its authorized June29 correction;16 receipt links, ₱13,828 total, row IDs/order and pending status preserved. Linked expense/reimbursement effects and one revision audit were inventoried; guard restored. Actual browser/XLSX/PDF numbering/table/caption checks pass. Twelve JPGs were not embedded in local PDF export due to OneDrive configuration; do not describe it as a complete receipt-image pack. Full Finance report/evidence links are in the LQ016 handoff.
- Tab2’s prior real SI013 BIR2307 upload into the canonical LBI folder had exact source hash/size, a single `.pdf`, typed-link persistence and idempotent retry. Do not create a duplicate test upload; verify the existing linked item after deployment. SI008 still needs an explicit legacy folder mapping.
- PR144 is already merged at main63dfb33. This follow-up release must branch from current main and use a new PR. Main merge auto-deploys Firebase Hosting and Functions. No broad Firestore backfill; no deployment until release checks and PR review pass.

## 2026-10-15 — Fixed liquidation physical item references; LQ016 protected locally

- RJ delegated via Tab2 `n-9a135b3b`; date correction held until stable physical references can be persisted. Added server-owned versioned `physical_item_numbering` ledger, transport physicalItemNo, immutable row-ID references, retained deleted/reserved numbers and monotonic nextItemNo. Legacy baseline is saved pre-correction chronology, not stored array index; all27 supplied LQ016 references match, including target physical7/stored4.
- Both APIs preview numbers without GET writes; active owner/admin metadata-only initialize endpoint requires exact saved-content hash/full mapping and rejects stale data/pending revisions. Transactional reservations cover draft/proposal/application paths before accounting side effects; concurrent/stale number claims reject and gaps can remain after failed/abandoned proposals. Initializer/reservations preserve raw saved row content and review hash; actual content edits retain existing review/payment behavior. Existing broader financial revision workflow remains as-is, not newly transactional.
- Updated desktop/mobile item cells, row-specific accessible labels, PDF/XLSX item numbers, receipt captions/QR labels, known-item new filenames and reimbursement line labels. New-row allocation keeps a local high-water mark; same-form XLSX import can retain row IDs by fixed item reference. No cloud rename or historical row-ID replacement. ADR-0005/migration004 document additive schema and an explicit-ID offline planner; no direct apply/rollback/backfill.
-74 Node tests (13 numbering/initializer/public-route/migration/Functions cases, two actual PDF/XLSX generator cases, plus workflow/reimbursement/evidence),33 focused React tests, TypeScript, focused lint, syntax/diff and build pass. Initial build caught a TypeScript test/helper return-type issue, corrected before successful final build. Existing build/nested-button warnings remain.
- Actual Chrome LQ01627-row read matches baseline. Unsaved06-29 preview moves the 600 line first but keeps Item7/all1–27; add/delete28 then add creates29. Actual XLSX preview shows7,1,2,3 and all27 stable numbers. Preview `/tmp/ioct-lq016-unsaved-date-preview.xlsx`, also generated in Downloads, is UNSAVED ONLY. Added actual jsPDF/autoTable and XLSX generator regression fixtures proving all27 numbers, corrected-date Item7 and PDF receipt caption; fixture PDF `/tmp/ioct-lq016-fixed-numbering-fixture.pdf`. Browser PDF export with original receipt images remains untested. Canceled scratch edits and closed only scratch tab. Original evidence/PDF and pending BIR recovery preserved.
- Fresh Firestore read05:07UTC confirms saved-content hash unchanged, numberingPersisted=false,27 rows,total13828,targetDate2026-08-10. Guarded3305 restarted with new backend/build; initializer remains403-blocked, AI-only receipt preview calls remain allowed. No production metadata/date/receipt/business writes, deployment/push/merge. All source changes remain local/uncommitted in isolated `/tmp/ioct-finance-evidence-release`; original workspace source preserved.
- Handoff contract `docs/agent/LQ016_PHYSICAL_NUMBERING_HANDOFF_2026-10-15.md`; exact dry-run body `/tmp/ioct-lq016-physical-numbering-manifest.json`. Queued Tab2 note `n-e957b86d` (reply_note could not find delivered note in this MCP session). Delivery/readiness acknowledgment and live metadata freeze/readback pending; freeze/readback BEFORE date save through corrected API, with existing accounting-sync side effects separately reviewed.

## 2026-10-15 — Missing LQ009 read-only finding

- Independently read production Firestore: no LQ26-009 match and migrated document `0UQNejKRDq4LDS92fZGt` is absent. Form-number migration maps it to old LQ-0032/Kim. This is database absence, not a dropdown-only filter.
- Read Tab2's completed hash-verified backup/report: presentAug27, absentSep29; filed2100/four rows (unapproved4934 revision is separate). All four filed expenses match LQ016 under new IDs, suggesting re-filing; actor/reason and ledger duplication remain unproven. Surviving source expense references require overlap reconciliation before any restoration. Report `/Users/reuelrivera/IOCT CoWork/IOCT Finance/docs/agent/memory/log/2026-10-15-kim-lq009-missing-record.md`. No restoration, payable changes or deletion.


## 2026-10-15 — Chronological liquidation rows and automatic receipt row names

- RJ requested date oldest-to-newest and automatic correct-row receipt naming; confirmed Both (new uploads) in the clarification. New/loaded forms default to ascending date; equal dates remain stable and undated rows follow dated rows. Existing manual date/amount sort remains available. Display sorting copies rows rather than rewriting saved row order/review fingerprints.
- Corrected receipt gallery/phone QR labels to use the current sorted row order plus Particulars, and PDF receipt captions to use PDF export order. Receipt links stay bound to stable row IDs. PDF/spreadsheet exports retain chronological sorting through the shared helper.
- New row attachments, desktop scans/batches and phone single/batch delivery use form/date/row-description filenames with a bounded, sanitized unique suffix and one extension. Metadata matches actual upload filename. Names capture details at upload time; mutable row numbers stay in live labels. Existing cloud filenames/originals/pending uploads are preserved; no rename/backfill or schema changes.
- Checks:20 focused React/helper tests (including immutable/stable chronology, reordered label identity, safe/unique names and phone upload/link filename consistency), TypeScript, focused ESLint, diff and production build pass with existing warnings. Actual authenticated Chrome read-only LQ26-014-RJR review:9 rows open oldest-first; all9 receipt labels match row Particulars under both ascending/descending. Evidence `/tmp/ioct-row-order-browser.json`. New cloud filename behavior is covered by mocked upload/link checks, not another live upload.
- Rebuilt local3305 frontend; close only scratch test tab, preserve user's tabs/drafts. No DB/OneDrive writes, deployment or pushes. Code remains local/uncommitted in `/tmp/ioct-finance-evidence-release`; original workspace source untouched. Requirement/memory updated; technical notes in isolated release `docs/architecture/LIQUIDATION_RECEIPT_LABELS.md`.


## 2026-10-15 — Fix liquidation table wheel scroll trap

- RJ reported vertical scrolling only worked with pointer outside the liquidation table. Actual Chrome showed table overscrollY/X both contain, despite no inner vertical overflow (height851/client851). Global index.css applies overscroll containment to every MUI TableContainer, preventing scroll chaining to the page.
- Scoped `overscrollBehaviorY: auto` to liquidation table; horizontal containment/overflow and other dialogs/tables unchanged. Native Chrome wheel reproduction with actual global CSS: page stayed0px before fix, moved200px after; horizontal wheel moved table200px with pageX0. Rebuilt actual3305 UI computed styles confirm vertical auto, horizontal contain/auto overflow. Evidence `/tmp/ioct-liquidation-scroll-check.json` and script alongside it.
- Focused lint, TypeScript, diff and production build pass (existing warnings). Only isolated local release source/frontend changed; original user tabs/drafts and pending recovery preserved. Closed only Tab3's synthetic scratch tab. No database/OneDrive writes, deployment or dependency changes. Refresh the existing user review tab to load corrected styles.


## 2026-10-15 — Gemini crop suggestions and current Flash-Lite receipt model

- RJ requested easier receipt upload/scanning through Gemini crop suggestions and asked whether Flash-Lite was current. Confirmed Assist chat already defaulted to3.5, but receipts/cropping still used3.1. Checked Google's official model list and updated both API copies' receipt/crop defaults to `gemini-3.5-flash-lite`, preserving env overrides and Live settings. Real API call with synthetic receipt returned valid whole-paper corners using3.5; no real customer image sent in this probe.
- Added shared crop suggestion service across single-photo expense/liquidation/phone scans and batches. Smaller preview, 12second request abort, validated geometry, local/full-photo fallback. Existing editable cropper now offers Full photo; batch retry says Suggest again. Row photo attachments now queue a confirmation preview before upload; PDFs retain direct attachment. No new dependencies/schema or dual-original archive.
- Checks:36 Node tests including both crop API functions/geometry/Functions packaging plus existing evidence regressions,16 React tests including AI/local/full fallbacks/PDF/timeout/batch confirmation/row attachment, TypeScript, focused ESLint, syntax/diff and build pass; existing ScanBatch nested-button/build warnings remain. Actual authenticated Chrome synthetic attachment preview returned200 in4seconds, valid corners, Full photo reset and zero OneDrive uploads; canceled afterward. Evidence `/tmp/ioct-receipt-crop-browser.json` and `/tmp/ioct-receipt-crop-gemini-probe.json`. Real photos/employee roles/Safari hardware remain untested.
- Rebuilt isolated release frontend and restarted reviewer on3305 to load new receipt defaults. Temporary wrapper allows authenticated AI-only detect-crop/parse POSTs; upload/evidence guards still403, crop unauth401, health200. Previous wrapper backup `/tmp/ioct-live-review-before-crop-assist-20261015.cjs`; startup seeding disabled. No business/OneDrive writes or deployment. Existing tabs/pending recovery preserved. All application changes remain local/uncommitted in `/tmp/ioct-finance-evidence-release`; original workspace source untouched.


## 2026-10-15 — Restore Particulars readability in finance review checkout

- RJ observed Particulars had returned to a small textbox while reviewing liquidations. Confirmed Chrome liquidation page is localhost3305 and isolated release source retained a single-line desktop input/160px header; the original workspace's 360px/three-line improvement was uncommitted and excluded from release integration as unrelated dirty work.
- Ported only the intended desktop readability change into release LiquidationFormPage: 360px minimum, three visible lines, 1.5 line height, automatic growth and row-specific accessible name, preserving warning adornment/edit behavior. Phone card now also starts at three lines without forcing desktop width. Original workspace source untouched.
- TypeScript, focused ESLint, diff check and production build pass (existing warnings). Rebuilt served release/build; separate authenticated Chrome tab/unsaved UI row confirms Particulars textarea height72px at 24px line-height (three lines), 360px control minimum. No database/OneDrive writes, deployment or restart; existing review tabs/drafts and pending upload preserved. Refresh existing review tab to load updated frontend.


## 2026-10-15 — Tab 2 real BIR2307 fix validation passed

- Received note `n-804699d9`; read Finance report `/Users/reuelrivera/IOCT CoWork/IOCT Finance/docs/agent/memory/log/2026-10-15-bir2307-corrected-live-validation.md` and machine evidence `Invoice/audit/bir2307-fixed-validation-2026-10-15.json`. Independently compared saved before/after snapshots: all nine invoices, CAs, liquidations and reimbursements unchanged; SI013 is the sole changed invoice-evidence response. Browser/service results below are attributed to Tab 2, not rerun here.
- One actual authenticated SI013 upload succeeded into existing `IOCT2606001-LBI RCS Cabuyao Additional Room Integration/Sales Invoice`, filename has one .pdf; downloaded 1,306,584 bytes/SHA256 match source. New item `01DAS753QCBOZ7IUFMVBG3OWOSKUHDEQKU` and one active BIR2307 document/link intentionally remain. UI link persisted after panel refresh/close/reopen; exact API retry retained revision 1 and one history event each, with one upload total. No certificate review or financial/status writes.
- Original pending item `01DAS753RFBFISMRB2HVHKHPL65NNRB2EE`, sessionStorage and original canonical file preserved. Original reviewer/frontend restored on3305; guard POST403 verified by Tab 2. No deployment/push/merge; fix remains local/uncommitted.
- Historical read-only gap: SI008/project_3 lacks explicit execution ID/Calcsheet mapping and IOCT2602001-prefix folder, despite existing ACTI2512-02-RPP legacy folder. Explicit mapping is needed before upload; no SI008 upload or mapping write performed. Alternate years/pagination/ambiguous-stale mappings/child creation remain automated-only; staff roles/certificate saves and full-page post-restart reload are outside this live check.


## 2026-10-15 — Tab 2 real-service fix validation delegated

- RJ requested delegation of real hands-on testing to Tab 2 (IOCT Finance). Queued Bayanihan note `n-4d901066` with local source/build locations, restart/guard instructions, exact acceptance checks and source evidence. Delivery follows Bayanihan's note approval/auto-delivery mechanism; no acknowledgment or test results yet.
- Scope: narrowly controlled genuine BIR2307 upload/evidence-link persistence against actual Firestore/OneDrive, invoice baseline comparison, filename/folder/hash checks and refresh/reopen recovery. Preserve original SI013 pending item/sessionStorage and all artifacts; no deployment, financial-record writes, certificate review or deletion/move. Restore guarded reviewer after test. Tab 3 did not perform new live uploads/writes in this delegation turn.


## 2026-10-15 — BIR2307 project folder and filename correction

- Implemented delegated SI013 upload fixes in isolated `/tmp/ioct-finance-evidence-release` (base `32bddf3`), retaining unrelated original-workspace source changes. Local changes are uncommitted; no push, merge or deployment.
- Documents upload sends invoice identity and configured execution root instead of cached project title/current year. Both API copies resolve the current Project List execution ID, then linked Calcsheet ID; unmapped projects search flat/all-year folders with pagination and canonical PCS customer suffix preference. Missing/ambiguous/stale mappings stop the upload. Only Sales Invoice child creation is allowed, addressed by parent item ID; no execution project creation/rename/move.
- Strip extension before truncating stem; collapse repeated terminal extension, retaining timestamp/random prefix and original extension case. SessionStorage pending-upload recovery is unchanged; regression now closes/reopens after failed link before retrying once.
- Checks: 32 Node finance evidence/folder/upload tests (including Functions packaging and both API handlers), 13 focused React tests, `tsc --noEmit`, focused ESLint, Node syntax and `git diff --check` pass. Production build passes to separate `/tmp/ioct-bir2307-build-20261015`; existing CRA lint/Browserslist/Node/bundle warnings remain. No lint/typecheck package scripts exist; invoked installed binaries. Dependencies already installed; no install/schema/migration needed.
- No browser actions, live uploads or business writes performed. `/tmp/ioct-live-review.cjs`, served build/port3305 and pending/unlinked test item `01DAS753RFBFISMRB2HVHKHPL65NNRB2EE` were not changed. Tab 2's earlier upload/hash and nine-record baseline results remain attributed to its report; no successful real typed-link persistence or post-fix real upload claimed. Preserve pending metadata; do not re-upload, move or delete the test copy.


## 2026-10-15 — PR144 marked ready at RJ request

- Confirmed isolated release worktree clean and local/remote release heads synchronized at `7f7a50f`; GitHub reported mergeable draft targeting main.
- Marked PR144 ready for review and updated PR/project memory. Committed/pushed readiness documentation on release branch only; preserved unrelated original-workspace changes. Prior 137 backend/28 UI/type/lint/build and independent actual-data read/UI checks remain attributed to their recorded runs; no application changes requiring rerun.
- Known inherited mobile CA Edit and real-service persistence/upload limitations retained. No merge, deployment or production business-data changes.

## 2026-10-15 — Record Tab 2 actual-production-data local review

- Read the independent report and verified inherited CA mobile Edit omission against actual source/main diff. Recorded successful desktop/phone Documents/2307 entry, review API, reimbursement scope/paid-open and unchanged baseline checks, attributed to Tab 2.
- Recorded P2 F1 in Known Issues and preserved the reviewer’s limits: zero typed links, no linked-certificate editor/history or writes, only legitimate RJR role and Chromium responsive viewports. No source fix, production mutation or deployment. Updated draft PR144 review evidence; no application tests rerun for documentation only.
- Report: `/Users/reuelrivera/IOCT CoWork/IOCT Finance/docs/agent/memory/log/2026-10-15-pm-local-real-data-check.md`. Server3305 remains running with business-write guard.

## 2026-10-15 — Integrate missing invoice Documents / 2307 release with current main

- Worked in isolated `release/finance-evidence-2307` from fetched main `90a2def`; cherry-picked reviewed feature `5f961ad`, preserving both task-log histories. Original dirty workspace/private artifacts remain excluded.
- Consulted the local Graphify map and checked actual UI/API code. Fixed the semantic mobile integration gaps: invoice Documents replaces removed scan-upload handlers in both phone invoice lists; paid-open reimbursement cards show zero cash due, original paid amount, workflow status and payment history. Preserved desktop actions and current main's mobile layouts.
- Added two mobile invoice Documents regressions and a mobile paid-open reimbursement regression; repaired the existing Collections auth test fixture and used accessible card groups for targeted checks.
- Passed all 137 backend tests and 28 focused React/WHT tests, TypeScript, focused ESLint, both API syntax checks and diff check. Final React command used `--runInBand --testTimeout=20000` after initial default-timeout failures; missing test auth was corrected. Dependencies/lockfiles unchanged; reused installed dependencies. `NODE_OPTIONS=--max-old-space-size=6144 npm run build` passed with lint, Browserslist, Node deprecation and bundle-size warnings.
- No main merge, deployment, production data writes, real uploads or backfill. Real-service and deployed checks remain pending; opened draft PR #144 (https://github.com/tj-vibe-coder/pmv2/pull/144), confirmed draft/main target and mergeable state. Prior Chrome fixture reviews remain attributed to their reports, not rerun here.

## 2026-10-15 — Resolve PR #137 project-history conflict

- Merged current `origin/main` into `rj/dev` in an isolated worktree, preserving unrelated dirty finance/project changes in the original workspace.
- Resolved the sole textual conflict in `docs/PROJECT_HISTORY.md` by retaining the October 7 ACTI-fronting entry and all October 8–12 mobile-interface entries in chronological order. Verified every nonempty line from both source versions is retained and no conflict markers/unmerged index entries remain.
- Backend ACTI-fronting/cash-advance editing suite: 19 tests passed. TypeScript and focused CA lint passed. UI regression suites: 10 tests passed when run without a simultaneous build; initial parallel runs timed out finding the owner Edit button. No source/test change was needed.
- `NODE_OPTIONS=--max-old-space-size=6144 npm run build` — passed using main's documented memory setting; existing build warnings remain. Default-heap build was stopped while still compiling before this successful run. `git diff --check` and staged diff checks passed.
- No deployment or production data changes. Main's existing mobile changes merge normally; no manual application-code edits were made for this resolution.
## 2026-10-15 — Finance release prepared for PR

- RJ authorized commit/push after independent F1–F3 and W1/W2 closure. Prepared an isolated feature branch from rj/dev, excluding unrelated workspace edits and private tmp artifacts.
- Verified the exact staged tree in an isolated directory: 96 Node +22 React/WHT tests, TypeScript, focused lint, both API syntax checks, production build and staged diff check passed. Prior independent Chrome fixture checks remain attributed to the reviewer. Real-service gates remain pending; no deployment or production writes.

## 2026-10-15 — Independent W1/W2 fix recheck

- Reviewed builder corrections and restarted only isolated preview. Original public-router unknown-settlement reproduction now returns source_review_required without source changes. Independent settlement matrix covers unknown/invalid/zero/CA-covered/pending/historical paid controls.
- Actual Chrome STAFF handover with nonempty note → RJR return confirms prominent return reason/authenticated actor/actual time and separate original handover. Fixture payment statuses/amounts unchanged; history retained. Screenshot and logs under `/tmp/ioct-workflow-recheck-*`.
- Independently passed 96 Node +22 React/WHT tests, TypeScript, focused review component/test lint, both API syntax checks and diff check. No repeated build during focused recheck; corrected static build exercised in Chrome, build success remains attributed to builder.
- Appended independent closure to review report and updated known issues/state. No application changes, production/OneDrive mutations or deployment; real-service release gates remain.

## 2026-10-14 — Independent workflow findings W1/W2 corrected (Tab 4)

- Verified the independent report against current code; preserved unrelated workspace changes and original review findings.
- W1: no reimbursement document no longer implies settlement. Closure requires explicit paid history or valid zero-due accounting provenance (zero total or matching recorded CA coverage). Missing/null/blank/non-numeric/negative/inconsistent settlement stays open as source_review_required; known pending/positive liability remains awaiting payment. Added original public-router handover/review reproduction and a settlement matrix in both API variants, asserting unchanged financial source records.
- W2: main summary displays RJ return reason, authenticated name/ID and actual return timestamp prominently, with original staff handover date/actor/note separately labeled. Return API captures a name snapshot; older events use the recorded actor ID without borrowing staff identity. Added nonempty-note/return-reason and old-ID-only UI regressions, plus API return metadata assertions.
- Updated ADR-0004, schema/migration-003 policy docs, review follow-up, known issues and current status. No historical backfill, production/OneDrive mutation or deployment.
- Checks: 96 Node +22 React/WHT tests passed, TypeScript/focused ESLint and both API syntax/diff checks passed. `npm run build` passed with existing Browserslist/fs.F_OK/bundle-size notices; focused Tab 3 correction recheck queued, delivery/independent result pending.


## 2026-10-14 — Hands-on physical receipts/RJ review/payment workflow

- Read workflow/ADRs/migrations and current code/memory; restarted the isolated preview only. Actual Chrome exercised STAFF handover, OTHER restrictions, RJR review and closure, normal blocked payout, urgent paid-open/zero due/history, withdrawal/return, fresh reviewed-unpaid normal payout, and Open/Closed/All views. Visually confirmed top-aligned itemized controls beside multiline Particulars.
- Independently passed 92 Node tests, 20 React/WHT tests, TypeScript, focused lint, both API syntax checks, production build and diff check. Additional simultaneous line/remaining/batch probes in both API copies produced exactly one payment and funding sync.
- Wrote `docs/agent/LIQUIDATION_WORKFLOW_REVIEW_2026-10-14.md` with two reproduced P2 findings: premature closure when settlement metadata is unknown; returned-copy summary hiding RJ's reason/showing original handover details. Updated known issues/state; Tab 4 remains implementation owner.
- All write tests used isolated fixtures; reset fixture state between urgent and normal browser scenarios. No production/OneDrive writes or deployment. Real service integration gates remain open; no release approval implied.

## 2026-10-14 — Physical receipt handover, RJ review and conditional closure

- Implemented RJ's clarified answers: staff may record physical handover; urgently needed earlier reimbursement is allowed with a recorded reason. Normal payment follows current RJ review; earlier urgent payout does not close documentary follow-up.
- Added versioned physical submission (date/actor/notes), RJ-only possession confirmation/review/return/withdrawal and immutable history. Current form/submission versions and global revision guard against stale/concurrent actions. Prior generic admin reviews are retained without implying RJ confirmation.
- Derived liquidation/reimbursement workflow status independently of payment: awaiting physical, awaiting RJ, changed/review required, pending edit, awaiting payment or closed. Paid historical records stay paid; paid-but-open claims are visible at zero due, cannot be selected again, and expose payment history/urgent reasons. Added open/closed/all reimbursement views while preserving default pending-only API compatibility.
- Enforced normal/urgent rules on line/shared-transfer, whole-form, batch and legacy status-toggle APIs in both copies. Whole/remaining/batch payments now plan reads before transaction writes to prevent duplicate settlement/races with per-line payments. Preserved proofRef, transferId, funding mirror IDs and unpaid-only CA-excess restoration. Legacy toggles retain actor/time/exception history.
- Added ADR-0004, migration 003 (offline empty-write manifest/no inferred historical submission/review), product/schema/state/issues updates and an expanded in-memory fixture using actual reimbursement handlers. No production/OneDrive mutation or deployment; unrelated edits preserved.
- Verification: 92 Node API/migration/regression tests and 20 React/WHT tests passed. Initial test-only TypeScript/lint problems were corrected; final TypeScript, focused ESLint, syntax and diff checks passed. Isolated HTTP fixture smoke passed staff→RJ→closed and urgent paid-but-open paths. Final `npm run build` passed with existing Browserslist/fs.F_OK/bundle-size notices. Consulted local Graphify map (Liquidation mapped; Reimbursement absent), verified against actual code. Expanded Tab 3 hands-on brief queued after checks.


## 2026-10-14 — Physical receipts/RJ review closure extension requested

- Held the requested Tab 3 testing handoff when RJ added physical receipt submission and RJ review as conditions of liquidation/reimbursement closure.
- Inspected existing manual-review, liquidation and reimbursement/payment paths. Current reimbursement GET is pending-only; paid-but-not-documentarily-closed claims must remain visible without resetting cash due/payment history. CA Close & Settle moves cash/write-offs and must not be reused for documentary closure.
- Captured confirmed scope, proposed workflow, affected paths and acceptance cases in `docs/product/LIQUIDATION_RECEIPT_WORKFLOW.md`. Asked whether payment can precede RJ review and who records physical submission; dependent policy implementation awaits answers. No business-rule/app changes, production mutation or deployment in this extension-planning step.


## 2026-10-14 — Manual liquidation receipt review and top-aligned rows

- Implemented RJ's request for an in-app record of checking original/scanned receipts one by one against liquidation rows. Chose **Manual receipt review / Receipts reviewed**, with authenticated **Reviewed by**, actual **Review date** (including earlier paper checks), server recording timestamp, optional notes and explicit completeness/date/amount/particulars confirmation.
- Added a separate review collection/history, active admin/superadmin write guards, own-form operational read guards, review/content revision preconditions, idempotent retries and reasoned withdrawal. Saved form/receipt-link changes show review required while preserving previous history; payment changes are independent. No liquidation, CA, reimbursement or investment writes occur in review actions.
- Integrated into loaded submitted forms, disabled while editing/pending approval, and bound attestation to the content fingerprint returned with the displayed liquidation. Existing malformed legacy JSON remains loadable but cannot be attested.
- Applied RJ's screenshot correction: all expense row cells now align at the top beside multiline Particulars. Preserved existing spacing and unrelated workspace edits.
- Consulted local Graphify liquidation map and verified code/role/edit flows. Added ADR-0003 and migration 002 (offline empty-write manifest; no historical attestations synthesized), updated PRD/data model/state/issues and safe in-memory preview fixture.
- Verification: 82 Node API/migration/regression tests (both API variants) and 17 React/WHT tests passed. TypeScript, focused ESLint, both API syntax checks and diff check passed. `npm run build` passed, with existing Browserslist/fs.F_OK/bundle-size notices.
- No production/OneDrive mutation or deployment. Actual-browser review of this new UI remains pending; the CUI fixture-origin restriction and real-emulator environment limitations remain as documented. Existing signed paper forms remain external originals.


## 2026-10-14 — Independent recheck of F1–F3 corrections

- Reviewed Tab 4's targeted fixes and new regressions. Reran original isolated rollback/allocation probes: shared document retained with invoice B GET 200; removed allocation can now be matched; financial invoices unchanged.
- Actual Chrome fixture recheck covered reference and certificate conflict→Refresh and discard drafts→reopen latest values→save. Both succeeded; fixture amounts, WHT, received history, collection date and original pack stayed unchanged.
- Independently reran seven Node suites (74 passed), panel/WHT React suites (12 passed), TypeScript, focused ESLint, both API syntax checks and diff check. No new build run during this targeted recheck; prior independent build preceded corrections, corrected build reported passing by Tab 4.
- Appended independent closure evidence to review report and updated known issues/state. No application fixes, production/OneDrive writes or deployment; real integration gates remain open.

## 2026-10-14 — Finance review corrections F1–F3 (Tab 4)

- Verified Tab 3's independent findings against the current code and review report; preserved unrelated workspace edits.
- F1: migration rollback reads shared-document references inside its transaction and retains metadata used by links outside the removable manifest set (including inactive history markers). CLI reports retained IDs. Added runtime-link and overlapping-batch regressions; financial source records remain unchanged.
- F2: retained zero allocations no longer constrain matched booked-WHT/counterparty checks. Positive allocations retain those checks; omitted historical allocation IDs still fail, old evidence remains in history and previously unlinked zero allocations stay inactive. Regression exercised in both API variants.
- F3: Refresh explicitly offers to discard drafts, closes reference/certificate editors only after successful reload and tells the reviewer to reopen from current evidence. Added conflict/refresh/reopen/save regressions for both editors, asserting the latest revision and other reviewer's values.
- Updated ADR, migration/API docs, review follow-up, known issues and current status. Independent correction recheck and real emulator/OneDrive/deployed gates remain; no production data mutation or deployment.
- Checks: 74 Node tests and 12 React/WHT tests passed; `npx tsc --noEmit`, focused panel/test ESLint, both API syntax checks and `git diff --check` passed. `npm run build` passed (existing Browserslist/fs.F_OK/bundle-size notices).


## 2026-10-14 — Independent review of Tab 4 finance evidence

- Read release plan/ADR/API/migration docs and current code; independently reran the seven Node suites (68 passed), panel/WHT React suites (10 passed), TypeScript, focused ESLint and production build. All passed; existing build notices remain.
- Used actual Chrome at isolated port 3300, after RJ enabled/authorized Mac browser actions. Verified legacy pack preservation, 2307 link/printed evidence, metadata correction/history, conflict rejection and allocated unlink guard. Only fixture sign-in/financial data used; CUI's own browser remains origin-blocked.
- Reproduced three P2 defects with isolated migration/HTTP/browser probes; wrote `docs/agent/FINANCE_EVIDENCE_REVIEW_2026-10-14.md` with severity, steps, expected behavior and suggested regressions. Updated known issues/state; Tab 4 retains implementation ownership.
- `git diff --check` — passed. No application fixes, production/OneDrive mutations or deployment. Real service integration gates remain open; automated suite success does not resolve the additional reproduced defects.

## 2026-10-14 — Tab 4 finance evidence first release (Phases 0–2)

### Completed

- Took RJ’s build handoff; read AGENTS, project state/issues, PRD/architecture, plan and dated audit sources. Consulted local Graphify output (invoice coverage incomplete) and verified current code. Preserved unrelated uncommitted changes.
- Corrected only reimbursement route/funding helper sections in the checked-in Functions API: line payments, shared transfer/proof semantics, partial/remaining payments and paid history now match the local API. No broad server overwrite or deployment.
- Added shared invoice Documents with typed multiple links, stable file identity, deterministic concurrent/retry-safe appends, HTTPS/MIME/size validation, role enforcement, revisioned metadata/unlink reasons and immutable history. Retained legacy scan/pack views and source notes; replaced the scan-overwrite upload action. Unique upload names and retained upload metadata permit retry after link failure.
- Added EWT document/review access: printed certificate base/WHT/period/ATC/description, observed calculation, review flags/states/notes and shared certificate evidence allocations. Kept cash, booked WHT and historical expected/received flags unchanged.
- Added ADR-0002, schema/API/PRD documentation and migration 001: offline snapshot/manifest/totals/fingerprints, dry-run default, preconditions, idempotent emulator-only apply and compensating metadata rollback. Added isolated in-memory browser preview and excluded test-support utilities from deployment packaging.

### Checked

- `npm ls --depth=0` — passed; no dependency changes/install needed.
- `node --test server/financeEvidence.test.js server/financeEvidenceUpload.test.js server/reimbursementParity.test.js server/cashAdvanceEditing.test.js server/financeTrace.test.js server/financeTraceRouter.test.js server/financeTracePackaging.test.js` — 68 passed. Both API copies/runtime bundles, authorization, upload validation, retries/concurrent additions, old paid history, shared slip, all four audited printed bases, expected 3,611.58 WHT, migration dry-run/apply/rerun/rollback/preconditions and accounting regressions covered.
- `CI=true npm test -- --watchAll=false --runInBand src/components/finance/InvoiceDocumentsPanel.test.tsx src/types/Invoice.wht.test.ts` — 10 passed, including legacy availability, read/write roles, upload/link recovery and independent printed certificate amounts.
- `npx tsc --noEmit` and focused ESLint on new/changed frontend files/tests — passed. `node --check server.js` and `node --check functions/server.js` — passed.
- `npm run build` — passed on final frontend implementation; existing stale Browserslist, fs.F_OK and large-bundle warnings remain.
- `git diff --check` — passed.

### Remaining release gates / scope

- Real Firestore emulator unavailable (no working Java runtime/Firebase CLI); transaction/migration fixtures and CLI dry run passed. Authenticated browser/real OneDrive validation pending: existing app redirects to login; isolated fixture navigation on localhost:3300 was blocked by CUI’s origin allowlist. No request for credentials or production mutation.
- Live deployed endpoint capability inventory and fresh authorized production snapshot reconciliation remain pending before release. No production data, deployment or tax treatment changed.
- Phases 3–5 remain separate reviewable changes: incoming-payment ledger and received/deposit/clearance dates, outgoing/payroll evidence, missing-support dashboard. First release shares payment slips as evidence only.


## 2026-10-14 — Finance supporting-document implementation scope

### Completed

- Read the Finance handoff's full audit report, missing-support CSV sample and audit log; reviewed current project memory, PRD, architecture, Money Trail design and earlier liquidation/reimbursement plan.
- Verified invoice scan replacement, EWT plain-text reference, cumulative collections updates, existing local reimbursement proof/payment ledger and finance focus-link behavior against current code. Consulted available Graphify map; Collections coverage is incomplete.
- Created `docs/product/FINANCE_SUPPORT_PLAN.md` with six phases, proposed document/payment models, acceptance examples, migration/rollout safeguards and decisions for RJ. Recommend document handling and EWT first, followed by shared collections payments and broader support review.
- Documented the checked-in local/Functions reimbursement API disparity as Phase 0 work and a known issue. Audit totals remain attributed dated snapshots; no live reconciliation was performed.

### Verification

- Reviewed the plan against source report and actual UI/API/types in both server copies.
- `git diff --check` — passed.
- Documentation-only task: no application tests/build repeated; no app code, schema, database records or deployment changed. Existing unrelated edits preserved. Proposed architecture is not an approved ADR or implemented feature.


## 2026-10-06 — Cash Advance request editing

### Completed

- Added Edit, Save changes, and Cancel edit to the shared CA request form. Owners can edit their own pending requests; superadmins can edit approved requests too.
- Added transactional detail-edit handlers in both local and Cloud Functions APIs. The server derives the total from valid breakdown lines and checks ownership/status before writing.
- Approved amount edits adjust the remaining balance by the amount difference, retaining liquidation deductions and approval metadata. Approved investment funding entries are refreshed through the existing sync helper.
- Approval now uses a transaction so a concurrent owner edit cannot overwrite an approval with stale request data. Closed issued amounts remain fixed to protect existing settlements.
- Updated product requirements, project state, and known issues. Preserved unrelated existing workspace edits.

### Verification

- `node --test server/cashAdvanceEditing.test.js` — passed (14 tests across both API copies).
- `CI=true npm test -- --watch=false --runInBand src/components/CAFormPage.editing.test.tsx` — passed (3 UI tests: owner save, superadmin approved edit/cancel, ordinary admin restriction).
- `npx tsc --noEmit` — passed.
- `npx eslint src/components/CAFormPage.tsx src/components/CAFormPage.editing.test.tsx` — passed.
- `node --check server.js` and `node --check functions/server.js` — passed.
- `npm run build` — passed; existing Browserslist, Node deprecation, and large-bundle notices remain.
- `git diff --check` — passed.
- No dedicated lint/typecheck package scripts exist; used direct commands. Browser/manual review with actual records was not performed; no deployment or live database writes.



## 2026-09-21 — Client-supplied materials Sales scope and heading layout repair

### Completed

- Added **Client supplies materials — Sales counts services only** to the component section of an editable quotation.
- When enabled, the Sales project list and Calcsheet-to-Project-List contract sync use only Engineering Services, with the quotation’s discount and VAT applied; the quotation and BOM data remain complete.
- Repaired the inline-subheader layout regression: the long heading label is no longer rendered inside every editable description cell, and headings are anchored to the first selected row. Selected headings can be cleared through the section action.

### Verification

- `CI=true npm test -- --watch=false --runInBand src/utils/calcsheet/salesAccounting.test.ts src/utils/calcsheet/subheaders.test.ts src/utils/calcsheet/serverGrandTotal.parity.test.ts` — passed (24 tests).
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.
- Production build was not repeated because it remains blocked by the unrelated exhaustive-deps warning in `src/components/analytics/AnalyticsStudioPage.tsx:1115`.

## 2026-09-21 — Hide quotation part numbers in customer PDFs

### Completed

- Added a quotation-level **Hide part numbers in PDF** switch under Supply of Components.
- The switch hides component part numbers in all customer PDF component sections, including optional items, without deleting part numbers or affecting Excel exports.

### Verification

- `CI=true npm test -- --watch=false --runInBand src/utils/calcsheet/componentExportDetails.test.ts` — passed (2 tests).
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.
- Production build was not repeated: it is already blocked by the unrelated exhaustive-deps warning in `src/components/analytics/AnalyticsStudioPage.tsx:1115`.

## 2026-09-21 — Calcsheet quotation inline subheaders

### Completed

- Added calculation-neutral inline subheaders for component and service lines, assigned by selecting one or more rows and choosing **Add subheader**.
- Rendered each contiguous subheader block in the editable calculation sheet and customer-facing PDF/XLSX quotation exports.
- Kept subheaders separate from the existing pricing-group / LOT behavior, so quotations retain their totals and prior export semantics.

### Verification

- `CI=true npm test -- --watch=false --runInBand src/utils/calcsheet/subheaders.test.ts` — passed (2 tests).
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.
- `CI=true npm run build` reached compilation but failed on a pre-existing exhaustive-deps warning in `src/components/analytics/AnalyticsStudioPage.tsx:1115`; this feature did not modify that file.


## 2026-09-07 — Compact one-page quotation export

Added an explicit **Compact PDF (1 page)** action to the Calcsheet quotation editor. It is available for editable quotations with six or fewer item lines and sends the quotation renderer a tighter print-layout request; normal PDF export remains available and long quotations keep their readable standard layout. The threshold and scale selection are covered by `src/utils/calcsheet/quotationPdfLayout.test.ts`.

Verification: focused layout tests passed (3/3) and `npx tsc --noEmit` passed. The full suite ran with 301 passing tests, but the three existing `CollectionsDashboard.test.tsx` cases fail because their component is rendered outside `AuthProvider`. 

## 2026-08-28 — Tax Filer Role Scope Isolation & Dedicated Compliance Surface

Restricted the `tax_filer` role to dedicated Compliance & Accounting surfaces (Tax Filer Ledger, Sales EWT / 2307, Collections & Settled Ledger) and completely removed Projects, Sales, SOAs, Analytics, and Outflow & Expense operations:
- **Finance Navigation Bar (`src/components/finance/FinanceNavList.tsx`)**:
  - Hidden **Finance Analytics Studio** (`/finance/analytics`).
  - Hidden **Statements of Account** (`/finance/soa`).
  - Hidden entire **Outflow & Expenses** section (Expense Monitoring, Expense Register, Cash Advances, Liquidation Form, Direct Labor, Purchase Orders, Reimbursements).
- **Collections & AR / Finance Home ACTI Expected Watchlist (`src/components/CollectionsDashboard.tsx`, `src/components/finance/FinanceHomePage.tsx`)**:
  - Hidden **ACTI Expected Watchlist** tab (`?tab=acti`), top ACTI Watchlist KPI card, and Tab 3 panel from `tax_filer`.
  - Hidden **ACTI pending AR** and **ACTI ongoing** KPI cards on Finance Home for `tax_filer`.
- **Finance Home Dashboard (`src/components/finance/FinanceHomePage.tsx`)**:
  - Hidden SOA, Outflows, Analytics, and Investment Tracker from module lists and interactive cards.
  - Hidden Outflow KPI cards (*Total Expenses YTD*, *Outstanding Cash Advances*, *Pending Reimbursements*, *Latest Payroll Run*).
  - Hidden Section 2 (*Outflow & Expense Operations*).
  - Updated Quick Actions for `tax_filer` to surface `Tax Filer Ledger` and `Sales EWT / 2307`.
- **Workspace Navigation & Toggles (`src/components/Header.tsx`, `src/components/Sidebar.tsx`)**:
  - Hidden desktop and mobile workspace toggle switchers (Projects / Sales / Finance) for `tax_filer`, pinning them cleanly to the Finance/Compliance workspace.
- **Route Guards & Protection (`src/App.tsx`)**:
  - Wrapped all Projects workspace routes (`/dashboard`, `/projects/:id`, `/location-analysis`, `/clients`, `/material-request`, `/delivery`, `/suppliers`, `/purchase-order`, `/estimates`, `/reports`) with `TaxFilerBlock`.
  - Wrapped all Sales workspace routes (`/sales`, `/sales/calcsheet/*`, `/sales/clients`, `/sales/pricelists`, `/sales/material-request`, etc.) with `TaxFilerBlock`.
  - Wrapped all Analytics Studio routes (`/projects/analytics`, `/sales/analytics`, `/finance/analytics`) with `TaxFilerBlock`.
  - Wrapped SOA and Outflows routes (`/finance/soa`, `/finance/soa/:id`, `/finance/expense-monitoring`, `/finance/purchase-order`, `/finance/overhead-expenses`, `/finance/projects/:id/expenses`) with `TaxFilerBlock`.
  - Updated `RootRedirect` to land `tax_filer` on `/finance/tax-ledger` on default navigation.
- **Verification**:
  - `npx tsc --noEmit` passed with 0 errors.
  - `npm run test:ai-assist` passed (126/126 tests).

Added full payroll intelligence, headcount run rates, and DOLE P.D. 851 statutory 13th-month pay forecasting across IOCT Assist and Finance Analytics Studio:
- **IOCT Assist AI Tools & System Prompt Enhancement**:
  - Implemented `get_payroll_summary` tool (`server/aiAssist/tools.js`, `server/aiAssist/schemas.js`, `server/aiAssist/operator.js`): computes active employee headcount, monthly basic and meal allowance run rates, YTD actual payouts, remaining calendar cutoffs, and statutory DOLE P.D. 851 13th-month pay ($\frac{\text{Total Basic Salary Earned in Year}}{12}$).
  - Extended `query_analytics` tool to support operational domain `payroll` with `groupBy: 'employee' | 'forecast_payroll'`.
  - Updated AI Assist system prompt (`server/aiAssist/prompt.js`) and safety boundaries to allow authorized payroll analytics while maintaining zero-exposure security for credentials, passwords, bank details, and government IDs.
  - Mirrored changes to Cloud Functions via `npm run ai-assist:sync`.
  - Added unit test suites (`server/aiAssist/tools.test.js`); full suite 126/126 passing.
- **Finance Analytics Studio Integration (`/finance/analytics` via `src/components/analytics/AnalyticsStudioPage.tsx`)**:
  - Ingests active payroll employees and payroll run history alongside expenses.
  - Added visual dimension `forecast_payroll` with presets (`Payroll & Year-End 13th-Month Projection`, `Full-Year Compensation by Employee`).
  - Added **Executive Payroll Run Rate & Year-End Accruals Banner** displaying 5 executive KPIs: *Monthly Payroll Run Rate*, *YTD Disbursed*, *Projected Outflow (Sep–Dec)*, *13th-Month Accrual*, and *Full Year Grand Total*, with quick toggles for *Monthly Trajectory (Jan–Dec)* vs *By Employee Breakdown*.
  - Added natural language query interception for payroll, salary, 13th-month, and compensation prompts.
- **Verification**:
  - `npx tsc --noEmit` clean (0 errors).
  - `npm run test:ai-assist` 126/126 passing.
  - Live query verified: 5 active employees, ₱128,000/mo run rate, ₱534,500 YTD actuals, ₱512,000 Sep–Dec projection, ₱86,583.33 13th-month pay, grand total ₱1,133,083.33.

Overhauled the Finance workspace navigation bar, Finance Home dashboard shortcuts, and Projects sidebar integration for clear hierarchy, zero redundancy, and unique semantic icons:
- **Integrated Purchase Orders into Finance Workspace (`/finance/purchase-order`)**:
  - Added Purchase Orders (`src/components/PurchaseOrderPage.tsx`) directly into the Finance Outflow & Expense operations, giving finance managers complete oversight over procurement commitments and supplier purchase orders.
  - Mounted `/finance/purchase-order` route in `src/App.tsx`.
- **Differentiated & Semantic Iconography (Zero Repeating Icons)**:
  - Finance Home: `AccountBalance`
  - Finance Analytics Studio: `AutoAwesome`
  - Collections & AR: `Paid`
  - Statements of Account (SOA): `Description`
  - Sales EWT / 2307: `FactCheck`
  - Expense Monitoring: `AccountBalanceWallet` (parent)
    - Expense Register: `Receipt`
    - Cash Advances (CA): `RequestQuote`
    - Liquidation Form: `AssignmentTurnedIn`
    - Direct Labor: `Engineering`
  - Purchase Orders: `ShoppingCart`
  - Reimbursements: `PriceCheck`
  - Tax Filer Ledger: `MenuBook`
  - Profit & Loss: `Summarize`
- **Moved Sales EWT / 2307 under Compliance & Accounting (`/finance/ewt-2307`)**:
  - Placed BIR 2307 customer withholding certificate tracking under Compliance & Accounting alongside the Tax Filer Ledger (`/finance/tax-ledger`) and Profit & Loss, keeping BIR tax credit compliance consolidated.
- **Streamlined Projects Workspace Sidebar (`src/components/Sidebar.tsx`)**:
  - Removed `Expense Monitoring` completely from the Projects workspace sidebar, preserving clean domain separation so that all accounting, disbursements, and expense monitoring are exclusively managed within the Finance workspace.
- **Enhanced Budget vs Actual Spending Chart Visual Encoding (`src/components/ExpenseMonitoring.tsx`)**:
  - Updated the bar chart color scheme to use high-contrast palettes (Royal Blue `#3b82f6` for Budget and Vivid Amber `#f97316` for Spent).
  - Clarified that projects with set budgets and zero recorded disbursements will show only the budget baseline until expenses/liquidations are recorded.
- **Verification**:
  - `npx tsc --noEmit` passed with 0 errors.
  - Full unit test suite (41/41 suites, 301/301 tests) passed cleanly.

Implemented comprehensive expense forecasting and fixed recurring run rate modeling in Finance Analytics Studio (`/finance/analytics` via `src/components/analytics/AnalyticsStudioPage.tsx`) and backend AI deterministic tools (`server/aiAssist/tools.js`, `server/aiAssist/schemas.js`):
- **Fixed Recurring vs Variable Expense Modeling & Scenario Projections**:
  - Automatically identifies fixed recurring commitments (`OVERHEAD_CATEGORIES`: Rent, Salaries & Wages, Communication & Utilities, Government Contributions, Advertising/Marketing, Supplies, Repairs & Maintenance, Entertainment) vs variable direct project costs (Materials, 3rd Party Labor, Transportation, Gas, Meals, Accommodation).
  - Computes `monthlyRecurringRunRate` = `totalHistoricalRecurring / distinctMonthsCount`, `monthlyVariableAverage` = `totalHistoricalVariable / distinctMonthsCount`.
  - Added **Scenario Modeling (P10 / P50 / P90)**:
    - **Base Case (P50)**: Standard historical recurring run rate + historical variable monthly average.
    - **Conservative / High-Burn (P90)**: Fixed recurring baseline + 25% variable cost volatility buffer.
    - **Lean / Minimum-Burn (P10)**: Fixed recurring baseline + 25% lean direct cost reduction.
- **Executive Forecasting Intelligence Banner**:
  - Interactive top banner in Finance Studio rendering 4 executive KPIs: *Monthly Recurring Run Rate* (fixed baseline), *Monthly Variable Spend* (with active scenario indicator), *Estimated Monthly Burn* (with P10–P90 confidence range bounds), and *Horizon Outflow Forecast* (with quick 3M, 6M, 12M horizon buttons).
  - Interactive Scenario Switcher buttons (`[Lean (P10)]`, `[Base (P50)]`, `[Conservative (P90)]`) and distinct historical baseline provenance subtitle.
  - Cost driver chips showing top recurring category monthly run rates.
- **Visual Encoding Grammar**:
  - Added new Dimensions: `forecast_monthly` (Monthly Expense Forecast: Actuals + Horizon Projection), `forecast_recurring` (Fixed Recurring vs Variable Outflow Projection), and `forecast_category` (Recurring Run Rate by Category).
  - Added Metric: `recurring_runrate` (Monthly Recurring Run Rate in PHP).
  - Presets: `3-Month Expense Forecast (Recurring Run Rate)` (line chart), `6-Month Expense Outflow Projection` (bar chart), `Recurring vs Variable Expense Projection` (donut chart), `Recurring Run Rate by Category` (bar chart).
  - Visual distinction with Net Pacific Teal accents for projected forecast periods vs Primary Blue for historical actuals.
- **Natural Language Data Formulator**:
  - Added intent detection for natural language queries like `"forecast recurring expenses"`, `"project next 6 months burn rate"`, `"recurring vs variable split"`.
- **Backend AI Tools & Deterministic Sync**:
  - Extended `query_analytics` tool in `server/aiAssist/tools.js` and `server/aiAssist/schemas.js` to support `forecast_monthly`, `forecast_recurring`, `forecast_category` dimensions and `recurring_runrate` metric.
  - Sourced with provenance linking back to `/finance/analytics`.
  - Ran `npm run ai-assist:sync` and passed 125/125 AI Assist test suite.
- **Verification**:
  - Added unit test cases in `src/components/analytics/AnalyticsStudioPage.test.tsx` (5/5 passed).
  - `npx tsc --noEmit` and `CI=true npm run build` passed cleanly with 0 errors.

Implemented a 3-tab layout at `/finance/collections` (`?tab=receivables`, `?tab=settled`, `?tab=acti`) featuring the **Collected & Settlement Ledger**:
- **Settlement Summary Metrics**: Displays Total Cash Inflow, BIR 2307 EWT Recognized, Gross Settled Revenue, and Average Turnaround Days (DSO from invoice date to collection date).
- **Settled & Collections Table**: Displays historical settlement records with collection dates, project name/number, PB milestone, invoice number, OneDrive scan preview links, bill-to counterparty, cash collected, BIR 2307 withholding tax recognition badge (linking directly to `/finance/ewt-2307`), settlement turnaround duration, and linked Statement of Account badges (linking to `/finance/soa/:id`).
- **CSV Export**: Added 1-click CSV export (`exportCollectedToCSV`) downloading all filtered settlement records with full financial and provenance audit columns.
- **Clickable KPI Navigation**: Top KPI cards now navigate or switch directly to corresponding tabs and filter presets.
- **Verification**: Created `src/components/CollectionsDashboard.test.tsx` (all 3 unit tests passing) and ran `npx tsc --noEmit` cleanly.

## 2026-08-27 — Updated SOA signatory title to Managing Partner - Operations

Updated the default signatory title for Reuel Joshua Rivera in the SOA generator, PDF export template, editor dialog, and server endpoints to **Managing Partner - Operations** (matching the user's `designation` in Firestore `users/user_14` and sales contacts seed). Also updated the `preparedByTitle` on the seeded Firestore SOA document `HH10tnufd8S9FwGMsNf0`.

## 2026-08-27 — Seeded sample SOA for ACTI from live PMv2 project contract data

Generated sample Statement of Account `SOA2607001-ACT-00` for Advance Controle Technologie Inc (ACTI) populated directly with current project database values (contract amounts, commercial trail PO numbers, and completed job milestones):
- With PO items (₱1,065,761.71): Ebecor 6u (PO 2606-005, ₱243,350.10), Ebecor 10u (PO 2606-006, ₱405,583.50), RCS Cabuyao (PO 2606-012, ₱30,000.00), ADI RH Temp (PO 2603-010, ₱386,828.11).
- Pending PO items (₱1,072,202.00): Ebecor 14u (₱597,702.00 in DB contract), Tann SCADA (₱161,300.00 in DB contract), ADI B1P1 Calibration (₱299,700.00 in DB contract), RCS Plaridel June 14 (₱13,500.00 in DB contract).
- Total Outstanding (VAT-EX): ₱2,137,963.71.
- Document stored in Firestore `statements_of_account` (ID: `HH10tnufd8S9FwGMsNf0`) and accessible at `/finance/soa`.


## 2026-08-27 — Customer EWT / BIR 2307 first slice

Invoices gained optional `wht_amount` (cash stays on `amount_collected`). Paid = cash + EWT. Collections KPIs split Cash vs EWT; new read-only register at `/finance/ewt-2307`. Certificates stay `expected` until a 2307 is on file. Backfill script `scripts/backfill-invoice-wht.js` splits SI 001/004/007 (₱3,611.58 total).

## 2026-08-27 — Client filter on Projects list

Dashboard filter bar now has a Client dropdown (account names from the project list). Selection is persisted with the other list prefs.

## 2026-08-27 — Persist last sort and filters on Projects and Calcsheet

Dashboard and Calcsheet project lists remember sort + filters in localStorage (`projects-list-prefs`, `calcsheet-projects-prefs`). Calcsheet already saved sort; filters (search, status, customer, year, formula, active-only, hide lost/inactive) now persist too.

## 2026-08-27 — Projects status filter is a checkbox multi-select

Dashboard Status dropdown now matches Calcsheet: checkboxes for each project status. Empty selection still means All.

## 2026-08-27 — IOCT2601001 budget from PCS2512036 (₱299,700)

Set `project_budget` to ₱186,600 (IOCT ₱299,700 − margin ₱113,100) and linked `calcsheet_project_id` / `calcsheet_code` to PCS2512036-ADI-00. PCS2602005-ACT-00 is no longer in calcsheet (user cleaned the duplicate).

## 2026-08-27 — Backfilled project_budget on 15 Project List rows

Ran `scripts/backfill-project-budgets.js --apply` against production. 15 of 17 projects now have `project_budget` = IOCT quotation value − margin. Left unset: ACTI240808 (DOXO, no calcsheet) and IOCT2601001 (ADI calibration; contract ₱320,000 does not uniquely match a quotation).

## 2026-08-27 — Project budget from calcsheet; completion tooltip unit

Dashboard S-curve tooltip labeled Completion Trend (%) but formatted the value as pesos because Recharts passes the series display name, not the dataKey. Formatter now treats that series as a percentage.

Project Budget is seeded onto the Project List row at proposal→project handoff (`sync-main` / mark won): IOCT quotation VAT-ex value minus margin (cost basis), stored as `project_budget`. Amount-sync fills it only when the field is still empty so a typed budget is not overwritten. Project Details / Expense Monitoring / dashboard health / Project Expense Report read that field, then localStorage, then a live calcsheet fallback for older rows. Manual edits persist back to `project_budget`.

## 2026-08-27 — Sync billing-schedule milestones to existing invoices

Ready-to-invoice banner was still offering PB1/PB2 because Collections invoices had empty `pb_number`. Linked SI 004 → PB1 (Plaridel troubleshooting), Invoice 002 → PB1 and Invoice 008 → PB2 (ADI RH Temp).

## 2026-08-27 — Direct SIs 004 (LBI) and 007 (Smartech/Mondelez) collected

IOCT2605001 RCS Plaridel Troubleshooting: SI 004 2026-05-18, PO 26-317R, PHP 15,000 billed/collected, bill_to customer (not ACTI). IOCT2604001 Mondelez servo audit: SI 007 2026-05-30, PO 002.05.2026, completed, PHP 15,000 billed/collected. WHT noted on the invoice (300 / 750).

## 2026-08-27 — SOA With-PO lines: Lear 6u/10u, ADI Invoice 008, Cabuyao

- IOCT2606003 Lear 6 units PO#1211: ACTI PO 2606-005 (2026-06-06), completed 2026-03-24, ₱243,350.10 outstanding.
- IOCT2606002 Lear 10 units PO#0957: ACTI PO 2606-006 (2026-06-06), completed 2026-03-24, ₱405,583.50 outstanding.
- IOCT2606001 RCS Cabuyao: ACTI PO 2606-012 (2026-07-01), completed 2026-06-02, ₱30,000 outstanding.
- IOCT2602001 Invoice 008: unpaid Collections invoice ₱193,414.06 bill_to ACTI (002 already collected). Project fully billed; 008 sits in issued AR not Expected from ACTI.

## 2026-08-27 — SOA pending-PO lines: Lear 14-unit, ADI calibration, Plaridel June 14

- IOCT2601001 ADI calibration: completed 2026-05-25, contract ₱320,000, ACTI PO pending.
- IOCT2606004 RCS Plaridel Onsite June 14: completed 2026-06-14, contract ₱13,500 (was 15,000), ACTI PO pending.
- Created IOCT2608001 Lear MES 14 units (PO 0329 & 0330) from calcsheet PCS2607063, completed 2026-04-22, ₱597,702 negotiated, ACTI PO pending. No IOCT invoices — they sit in ACTI pending AR.

## 2026-08-27 — Split Expected from ACTI: pending AR vs ongoing no PO

Collections and Finance Home now segregate ACTI expected jobs: **pending AR** (completed/100%, awaiting PO or invoice) vs **ongoing** (in progress, typically no ACTI PO). Amounts still excluded from issued AR KPIs.

## 2026-08-27 — All Analog Devices projects flagged ACTI; Invoice 002 settled

All four Analog Devices Inc. projects now `with_acti` + ACTI partner: IOCT2601001 (calibration, SOA pending ₱320,000), IOCT2602001 (RH Temp Integration), IOCT2607003, IOCT2607004. IOCT2602001: ACTI PO 2603-010 (2026-03-13), completed 2026-04-14, Invoice 002 paid ₱193,414.05 on 2026-07-07. Expected-from-ACTI queue now uses remaining unbilled contract so Invoice 008 ₱193,414.06 stays on the queue.

## 2026-08-27 — Lear MES IOCT2602002A flagged ACTI (SOA 2603-011 settled)

RJ: this is ACTI-fronted, not direct Ebecor. Updated `project_5`: `with_acti`, partner ACTI, customer PO `731 & 773` (was `731 & 733`), ACTI PO to IOCT `2603-011` dated 2026-03-13, completed 2026-02-25, contract/billed ₱256,158. Added paid Collections invoice `SOA-2603-011` bill_to ACTI, collected 2026-05-07, so Expected from ACTI excludes it.

## 2026-08-27 — Expected from ACTI finance queue

Read-only Collections section + Finance Home KPI derived from ACTI `commercial_trail` / `with_acti` projects that have no IOCT invoice. Stages: Pending PO vs PO in · Uninvoiced; timing Upcoming / Due this week / Past expected (never Overdue). Amount is IOCT contract (expected), excluded from AR Outstanding/Overdue. Tann surfaces ₱178,670 expected 2026-10-03. Belmont (direct) is excluded.

## 2026-08-27 — ACTI commercial trail v1

Implemented ACTI-only dual-PO / partner-SI coordination on `projects.commercial_trail`. Direct jobs (Belmont) keep a single customer PO to IOCT.

- Types/helpers: `CommercialTrail`, `isActiInvolved`, `stripCommercialTrail`, `applyBackToBackExpectedDates`.
- Dashboard: “to ACTI” chip on customer PO; extra **ACTI PO (to IOCT)** column when any row is ACTI-fronted.
- Edit Project + Project Details: trail fields only when Joint with ACTI.
- SOA retroactive PO writes `commercial_trail.acti_to_ioct_po_*` for ACTI jobs and never overwrites customer `po_number`. Direct jobs still update `po_number`.
- Tann `project_1` backfilled (SI#0076, COC 2026-06-23, expected 2026-10-03, ACTI→IOCT pending). No Collections invoice created.
- `npx tsc --noEmit` clean. `node --test server/soa/soaRouter.test.js` 4/4.

## 2026-08-27 — Tann SCADA (`project_1` / IOCT2512001) project + finance note

RJ walkthrough of Tann Group SCADA Server Upgrade. Wrote live Firestore `projects/project_1` only (no collections invoice, no SOA):

- Status remains Completed; site progress 100%; evaluated progress set to 100% / PHP 178,670 after COC served and approved 2026-06-23 (`completion_date` / `updated_completion_date`).
- Contract amount confirmed from IOCT quotation `PCS2508034-TPI-00` grand total PHP 178,670 (VAT-EX). Billed amount left at 0 — IOCT has not invoiced ACTI.
- Remarks + payment_terms now record: quotation sent 2026-05-25; ACTI has not PO'd IOCT; ACTI SI#0076 to Tann on 2026-08-04 (60 days); ACTI collection and IOCT expected invoice/collection 2026-10-03.
- Did **not** create an `invoices` row for SI#0076 (that is ACTI→Tann, not IOCT→ACTI) and did **not** mint an expected IOCT invoice (would show as live unpaid AR).

Gaps to add later if this pattern repeats: partner SI to end customer, expected vs issued IOCT invoice, separate ACTI→IOCT PO vs customer PO, COC-approved as a first-class date (vs PDF certificate / completion_date).

## 2026-08-27 — Revert page logo to original IOCT mark (keep Nylle favicon)

Nylle was asked to change the **favicon only**. The in-app header had been switched to the new circular i/O mark (`logo-ioct-only.svg` / `.png`), which rendered as "IOT" next to workspace titles.

- Restored `public/logo-ioct-only.svg` and `public/logo-ioct-only.png` from `abb8c56^` (original IOCT I+C+T icon).
- Left `public/favicon.svg` and `public/favicon.ico` as the new circular i/O mark.
- Cache-busted the header image to `/logo-ioct-only.svg?v=10` so browsers do not keep the old file.

## 2026-08-27 — Updated In-App Navbar Brand Logo (`logo-ioct-only.svg` & `logo-ioct-only.png`)

- Replaced `public/logo-ioct-only.svg` and `public/logo-ioct-only.png` with the new circular IOCT mark (`i/o` + cyan outer arc + bottom T-bar).
- This updates the primary brand logo displayed in the top navigation header bar ([`Header.tsx`](file:///Users/reuelrivera/Vibecode%20Projects/IOCT%20pmv2/src/components/Header.tsx)) across all workspaces (Projects, Sales, Finance, Employee) and in PDF statement exports.
- Synchronized assets into `build/` so that pushing/deploying hosting will cleanly overwrite production assets.

## 2026-08-27 — Segregated Domain Analytics Studios (Projects, Sales, Finance)

Segregated the Data Formulator Analytics Studio into three domain-specific studios:
1. **Projects Analytics Studio** (`/projects/analytics` & `/analytics/projects`):
   - Scoped to operational project execution, billings, contract balances, and category performance.
   - Dimensions: Category (HVAC, Electrical, Mechanical, Fire Protection), Status, Year, Client Account.
   - Metrics: Total Contract Amount, Remaining Balance, Total Billed, Project Count, Average Project Size.
   - Integrated into the Projects Sidebar navigation under Dashboard.
2. **Sales Analytics Studio** (`/sales/analytics` & `/analytics/sales`):
   - Scoped to quotation pipeline, deal win rates, opportunity grading (A/B/C/D), and client conversion.
   - Dimensions: Opportunity Grade, Deal Status (Draft, Sent, Won, Lost), Year, Target Client.
   - Metrics: Pipeline Value, Deal / Quote Count, Average Deal Size.
   - Integrated into `SalesNavList.tsx` under Sales Home.
3. **Finance Analytics Studio** (`/finance/analytics` & `/analytics/finance`):
   - Scoped to project & overhead expenses, cash advance liquidations, and Statements of Account (With PO vs Pending PO).
   - Dimensions: Expense Category, SOA / Payment Status, Fiscal Year, Payee / Client.
   - Metrics: Total Expense Amount, Unliquidated CA Balance, Transaction Count, Average Expense.
   - Integrated into `FinanceNavList.tsx` under Finance Home.
4. **Studio Workspace Switcher & Smart AI Routing**:
   - Built a top segmented banner in [`AnalyticsStudioPage.tsx`](file:///Users/reuelrivera/Vibecode%20Projects/IOCT%20pmv2/src/components/analytics/AnalyticsStudioPage.tsx) allowing 1-click switching between Projects, Sales, and Finance Studios.
   - AI Assist chart cards dynamically route to the matching domain studio (`/finance/analytics` for expenses/SOAs, `/projects/analytics` for portfolio/categories).
5. **Live Shelf Reactivity & Domain-Specific Data Pipelines**:
   - Fixed static snapshot locking: canvas rows now continuously derive from `activeDataset`, updating dynamically in real time whenever any shelf control (Dimension, Metric, Filter, Sort) changes.
   - **Sales Data Computation**: Sourced opportunity deal values by computing quotation totals (`computeTotals(latestQuotation).grandTotal`) from `useQuotationStore` instead of reading unpopulated flat fields.
   - **Finance Data Feeds**: Corrected response envelope unpacking for `/api/project-expenses` (`{ expenses: [] }`), `/api/overhead-expenses` (`{ expenses: [] }`), `/api/cash-advances` (`{ cash_advances: [] }`), and `/api/soa` (`{ data: [] }`), with automatic fallback synthesis from project financials so the studio always reflects accurate financial data.
6. **Verification**:
   - `npx tsc --noEmit` passing with 0 errors.
   - Backend unit test runner: 124/124 passing (`test:ai-assist`), 36/36 passing (`test:product-history`).
   - Frontend component test suites: 54/54 passing across 9 test suites.

## 2026-08-27 — Favicon updated to latest IOCT circular brand mark

- Sourced the uploaded circular `i/o` + blue outer arc + bottom T-bar brand mark from user upload.
- Generated multi-resolution `public/favicon.ico` (16, 24, 32, 48, 64, 128, 256), `public/favicon.svg` (crisp SVG wrapper embedding 512px PNG), `public/logo192.png`, and `public/logo512.png`.
- Updated `<link rel="icon">` in `public/index.html` with cache-buster `?v=9` for immediate browser reload.
- Synchronized all assets into `build/`.

## 2026-08-27 — Data Formulator AI Visualization & Analytics Studio Implementation

Implemented Microsoft Data Formulator-inspired AI-driven visual analytics across IOCT AI Assist and PMv2:
1. **Dynamic Visualizer & Shelf Controls** ([`AiChartPanel.tsx`](file:///Users/reuelrivera/Vibecode%20Projects/IOCT%20pmv2/src/components/ai/AiChartPanel.tsx)):
   - Enhanced chart rendering to support multi-type visual grammar: **Vertical Bar**, **Horizontal Bar**, **Line Trend**, **Area Chart**, **Donut / Distribution**, and **Interactive Data Table**.
   - Added interactive Data Formulator toolbar: chart type switcher buttons, sort mode toggle (highest/lowest/alpha), CSV export, TSV copy to clipboard, and deep dive button to Analytics Studio.
   - Styled with Net Pacific palette tokens (`#2c5aa0`, `#1e4a72`, `#00a8cc`, `#059669`, `#d97706`).
2. **Server Analytics Aggregation Tool & Safe Trust Boundary** (`server/aiAssist/tools.js`, `server/aiAssist/schemas.js`, `server/aiAssist/chat.js`):
   - Added `query_analytics` tool supporting multidimensional aggregations across `projects`, `expenses`, `quotations`, and `sales_pipeline` by `category`, `status`, `year`, `client`, and `grade`.
   - Updated `chartRef` schema to support dynamic chart types and optional `xAxisKey`.
   - Maintained strict zero-hallucination trust boundary: the model only proposes visual intent and pointers; server computes numbers deterministically from Firestore.
   - Registered `query_analytics` in `OPERATOR_ALLOWED_TOOLS` and synced to Cloud Functions (`functions/server/aiAssist/*`).
3. **Analytics Studio Interactive Workspace** ([`AnalyticsStudioPage.tsx`](file:///Users/reuelrivera/Vibecode%20Projects/IOCT%20pmv2/src/components/analytics/AnalyticsStudioPage.tsx)):
   - Dedicated full-page analytical workbench mounted at `/analytics/studio` (and `/analytics`).
   - Concept Encoding Shelves: Data Domain, Dimension (X-Axis), Metric (Y-Axis), Scope & Filter, and Visual Form.
   - Natural language "Formulate" prompt input with quick presets.
   - **Data Threads**: Session exploration history allowing branching and comparing multiple formulated views.
   - Split-view chart canvas and data table inspector with provenance tracking.
4. **Navigation & Inline Chat Integration** ([`AiMessageList.tsx`](file:///Users/reuelrivera/Vibecode%20Projects/IOCT%20pmv2/src/components/ai/AiMessageList.tsx), [`AiAssistDrawer.tsx`](file:///Users/reuelrivera/Vibecode%20Projects/IOCT%20pmv2/src/components/ai/AiAssistDrawer.tsx), [`Sidebar.tsx`](file:///Users/reuelrivera/Vibecode%20Projects/IOCT%20pmv2/src/components/Sidebar.tsx), [`App.tsx`](file:///Users/reuelrivera/Vibecode%20Projects/IOCT%20pmv2/src/App.tsx)):
   - Assistant chat messages now render interactive charts directly inline in the side drawer.
   - Clicking "Studio" in any chart card seamlessly passes the formulated dataset to `/analytics/studio`.
   - Added Analytics Studio to sidebar navigation.
5. **Verification**:
   - AI Assist test runner: 124/124 tests passing (`npm run test:ai-assist`).
   - AI React component suite: 51/51 tests passing (`AiChartPanel.test.tsx`, `AiMessageList.test.tsx`, `AiAssistDrawer.test.tsx`, etc.).


Added quick-access shortcuts to the Finance Home overview page ([`FinanceHomePage.tsx`](file:///Users/reuelrivera/Vibecode%20Projects/IOCT%20pmv2/src/components/finance/FinanceHomePage.tsx)):
1. **Header Action Button:** Added primary `Liquidation Form` button in the top title banner linking directly to `/finance/expense-monitoring/liquidation-form`.
2. **KPI Card Shortcut:** Made the **Outstanding Cash Advances** KPI card interactive with hover lift, an icon indicator, and a direct `Liquidate →` link.
3. **Module Cards:** Added **Liquidation Form** and **Statements of Account** cards to the modules grid for fast navigation across all financial functions.
4. **Verification:** TypeScript typecheck passed cleanly with 0 errors.

## 2026-08-27 — SOA Payments Reconciliation, OneDrive Archiving, & Project Sync

Enhanced the Statement of Account (SOA) module with production-grade integrations:
1. **Payments & Collections Reconciliation** (`server/soa/soaRouter.js`, `src/components/finance/soa/SoaDetailView.tsx`):
   - Implemented `POST /api/soa/:id/payments` allowing incremental payment recording against open SOAs.
   - Real-time recalculation of `amountCollected` and `balanceRemaining`, with automatic status transition to `settled` upon zero balance.
   - Built a Payment Recording dialog and collection history table in `SoaDetailView.tsx`.
2. **Corporate OneDrive Automated Archiving** (`server/soa/soaRouter.js`, `src/services/soaService.ts`, `src/store/soaStore.ts`):
   - Implemented `POST /api/soa/:id/upload-onedrive` saving PDF snapshots directly into corporate OneDrive under `00 Finance/Statements of Account/YYYY-MM/`.
   - Wired live "Save to OneDrive" button with external link indicator in `SoaDetailView.tsx`.
3. **Bidirectional Project PO Synchronization & Monitoring** (`src/components/ProjectDetails.tsx`, `server/soa/soaRouter.js`):
   - Retroactively assigning PO numbers in an SOA now automatically syncs `po_number` and `po_date` to the linked `projects` document in Firestore.
   - Added a dedicated Statements of Account tracking section in `ProjectDetails.tsx` displaying SOA references, PO status chips, and direct links.
4. **Verification**:
   - Node backend test runner: 2/2 passing (`server/soa/soaRouter.test.js`).
   - Frontend unit tests: 6/6 passing (`src/utils/soa/soaCodes.test.ts`).
   - TypeScript compiler: 0 errors (`npx tsc --noEmit` exit code 0).

## 2026-08-26 — Statement of Account (SOA) Subcontractor Monitoring & PDF Issuance Module

Implemented complete Statement of Account (SOA) suite for managing subcontractor billings to partner ACTI and direct clients:
1. **Data Model & Reference Codes** (`src/types/StatementOfAccount.ts`, `src/utils/soa/soaCodes.ts`):
   - Structured `StatementOfAccount`, `SoaItem`, and `SoaFootnote` schema supporting dual grouping: `With PO` (official PO numbers & dates) and `Pending PO` (`N/A *`, `N/A **` for work rendered awaiting PO).
   - Reference code generator & parser: `SOA{YYMM}{NNN}-{CLIENT}-{REV}` (e.g. `SOA2607001-ACT-00`).
2. **Backend Express Router & Sequential Numbering** (`server/soa/soaRouter.js`, `server/soa/soaSequence.js`):
   - Mounted at `/api/soa` in `server.js` and mirrored to `functions/server/soa/`.
   - Atomic sequence counter across year/month scopes.
   - Endpoints for listing, single retrieval, creation, updates, quick status transitions (`draft` → `for_payment` → `settled`), item-level retroactive PO updates, and revision bumping (`-00` → `-01`).
3. **React-PDF Issuance Engine** (`src/utils/soa/soaPdfExport.tsx`):
   - Pixel-for-pixel recreation of the sample SOA document (`SOA2607001-ACT-00 (1).pdf`): IOCT letterhead, Laguna registered address & TIN, recipient block to ACTI Lindsey Salilig, Account Summary table with With PO / Pending PO subtotals and Navy VAT-EX total bar, footnotes, dual signatures (RJR Solutions Manager + ACTI representative), and `pdf-lib` page stamping.
4. **Zustand State Store & API Service** (`src/store/soaStore.ts`, `src/services/soaService.ts`):
   - Reactive store with caching, filter/search state, optimistic updates, and item/status mutations.
5. **Frontend Management UI** (`src/components/finance/soa/`):
   - `SoaDashboardPage.tsx`: Net Pacific KPI cards (Total Outstanding, With PO, Pending PO, Total Settled), filter/search bar, and data table.
   - `SoaEditorDialog.tsx`: Full SOA creator & editor with project import, item toggling, footnote manager, and dynamic subtotal calculations.
   - `SoaDetailView.tsx`: Detailed inspector with PDF preview dialog, item table, and retroactive PO update modal (`RetroactivePoDialog.tsx`).
6. **Navigation & Collections Cross-Linking** (`src/App.tsx`, `src/components/finance/FinanceNavList.tsx`, `src/components/CollectionsDashboard.tsx`):
   - Registered `/finance/soa` and `/finance/soa/:id` routes.
   - Added Statements of Account to Finance sidebar navigation and Collections & Receivables header.
7. **Verification**:
   - Node backend test suite `server/soa/soaRouter.test.js` (2/2 passing).
   - Frontend unit test suite `src/utils/soa/soaCodes.test.ts` (6/6 passing).

## 2026-08-26 — Documented IOCT–ACTI commercial workflow context

Recorded the confirmed operating constraint in `docs/product/PRD.md`: IOCT and ACTI are distinct commercial parties even when they work on the same opportunity. Projects are frequently awarded to ACTI directly, and IOCT initiates or even completes execution before sending an IOCT quotation or receiving an ACTI Purchase Order. Operational workflows (project tracking, expenses, invoicing, SOA generation) must accommodate projects in flight or completed without gating on upfront PO numbers or pre-existing quotations. Future development must support IOCT statements of account to ACTI and reconciliation of invoices that were not initially captured in PMV2, while keeping IOCT receivables separate from ACTI's customer-facing quotation/records. No accounting treatment, legal relationship, data model, or automation was decided; those details await further business input.

## 2026-08-21 — Favicon update to full IOCT mark (`i/o` + cyan C arc + bottom T bar)

- Sourced the composite `i/o` + cyan C arc + bottom T bar mark from user upload.
- Generated multi-resolution `public/favicon.ico` (16, 24, 32, 48, 64, 128, 256), `public/favicon.svg` (SVG wrapper embedding 512px PNG), `public/logo192.png`, and `public/logo512.png`.
- Updated `<link rel="icon">` in `public/index.html` with `?v=8` cache-buster query parameter for immediate browser reload.
- Synchronized assets into `build/` and verified TypeScript compilation (`tsc --noEmit` clean).

## 2026-08-18 — System Backups Pane & Corporate OneDrive Export

Implemented complete Firestore backup manager and direct OneDrive synchronization:
1. **Backend Server Export Engine** (`server/backups/firestoreExport.js`, mirrored to `functions/server/backups/`):
   - Recursively dumps all Firestore root collections and nested subcollections.
   - Serializes custom Firestore types (Timestamps, DocumentReferences, GeoPoints, Buffers).
   - Generates manifest with SHA-256 integrity checksum, doc counts by collection, total count, and timestamped file name.
2. **OneDrive Graph API Sync Pipeline** (`server/backups/onedriveBackup.js`):
   - Integrates with corporate OneDrive via Microsoft Graph API client credentials proxy.
   - Ensures target folder `00 System/Backups/YYYY-MM-DD_HH-MM-SS/` exists.
   - Automatically uploads `firestore-backup-*.json` snapshot and `manifest.json`, returning OneDrive item ID and `webUrl`.
3. **Admin Express Router** (`server/backups/router.js` mounted on `/api/backups`):
   - Admin guard: strictly restricts access to users with `admin` or `superadmin` role.
   - `GET /api/backups/status`: checks Firestore connectivity and OneDrive health.
   - `GET /api/backups/history`: retrieves backup logs from `system_backups` Firestore collection.
   - `POST /api/backups/create`: exports database, uploads to OneDrive, and records audit entry.
   - `POST /api/backups/download-direct`: streams JSON snapshot for immediate browser download.
4. **Frontend UI & Navigation** (`src/components/SystemBackupsPage.tsx`, `src/services/backupService.ts`):
   - Net Pacific styled System Backups page under `/utilities/backups`.
   - Sidebar navigation item with `BackupIcon` for Admin/Superadmin users.
   - Status cards (Firestore, OneDrive, Most Recent Backup).
   - On-demand backup form with "Save to OneDrive" and "Download to Computer" toggles.
   - Live progress indicator during backup execution.
   - Backup history table with search/filtering, collection breakdown modal, SHA-256 copy chip, and direct "Open in OneDrive" links.

### Verification

- Node test runner `server/backups/backups.test.js` 4/4 passed
- Jest `SystemBackupsPage.test.tsx` 2/2 passed
- `npx tsc --noEmit` clean (exit code 0)
- `npm run ai-assist:check` no drift detected

Enabled chart widget rendering when using voice mode and resolved live streaming flicker:
1. When Gemini Live calls summary tools (`get_portfolio_summary` or `get_expense_summary`), `AiAssistProvider` constructs the `AiChart` structure from the real tool execution result and binds it to the active voice assistant turn.
2. Fixed live streaming flickering:
   - Disabled Recharts SVG bar entrance animation (`isAnimationActive={false}` in `AiChartPanel`) so rapid re-renders during live audio streaming don't reset bar heights from 0.
   - Wrapped `AiChartPanel` in `React.memo` with custom prop equality check.
   - Refactored `applyVoiceTranscript` in `AiAssistProvider` to update the active assistant message in place and retain chart state across streaming transcript chunks rather than clearing and splitting into multiple temporary message turns.

### Verification

- Jest `AiAssistProvider.test.tsx` 14/14 passed
- All AI component tests (`src/components/ai/`) 50/50 passed
- `npx tsc --noEmit` clean (exit code 0)

## 2026-08-15 — P5 in-app provider factory + deploy env (flag off)

Chat now goes through `createAssistChatClient`. `AI_ASSIST_CHAT_PROVIDER` allowlists `gemini` only; anything else is `invalid` and fails closed. Health and the drawer chip report provider + model. `.github/workflows/deploy.yml` writes Assist config into `functions/.env` with `AI_ASSIST_ENABLED=false` so production stays off. `GEMINI_API_KEY` is unchanged; `GEMINI_MODEL` remains the receipt-scan model.

### Verification

- `node --test server/aiAssist/*.test.js` 104/104
- `tsc --noEmit` clean
- Jest service/drawer suites green

## 2026-08-15 — P5 thin MCP adapter

Added a stdio MCP adapter that only calls `GET /api/ai-assist/operator/catalog` and `POST /api/ai-assist/operator/execute`. No new npm dependency. Run with `npm run ai-assist:mcp` after setting `IOCT_ASSIST_TOKEN` (and optional `IOCT_ASSIST_API_BASE`). HTTP remains the source of truth; MCP does not talk to Firestore. Confirm is still not an MCP/model tool.

### Verification

- `node --test server/aiAssist/*.test.js` 101/101

## 2026-08-15 — P5 operator HTTP catalog + execute

Exposed the existing allowlisted Assist tools as a model-agnostic HTTP contract so an external LLM/CLI can call them without a Gemini Live session. `GET /api/ai-assist/operator/catalog` returns declarations only. `POST /api/ai-assist/operator/execute` validates `{ name, args }`, reuses `createToolRegistry`, and never opens the rest of the PMv2 API. Propose still does not write; confirm stays on `/proposals/:id/confirm`. Same RJR/TJC + feature-flag gate as chat. Thin MCP adapter not built.

### Verification

- `node --test server/aiAssist/*.test.js` 94/94
- `ai-assist:sync` / `ai-assist:check` clean

## 2026-08-15 — Merged origin/main into rj/dev

Merged finance money-trail + follow-ups (PRs #68/#69, tip `2375a36`) into `rj/dev` as `2a73e60`. Conflicts in `server.js` (kept both Assist and finance-trace requires) and `docs/agent/PROJECT_STATE.md` (combined). Incoming diff was not a stale-clone rollback — Assist deletions in `git diff HEAD origin/main` were “main does not have Assist yet.” P3/P4 remain uncommitted on top. Post-merge: Assist + finance-trace node tests 118/118, `tsc --noEmit` clean after a liveClient test `this.closed` fix.

CUI preview stayed on `/login` (RJR signed in in another window). G0 mic/propose walkthrough not completed in this session.

## 2026-08-15 — Hands-free P3 propose-then-confirm and P4 always-on

Implemented P3/P4 on `rj/dev` with Kabayan (Antigravity Gemini 3.7 Flash) for server wiring and liveClient. Orchestrator owns the proposal store and UI confirm path.

P3: in-memory `proposalStore`; `propose_opportunity_update` never writes; confirm/reject routes are user-bound; allowlisted fields only (`status` without won/lost, `opportunityGrade`, `notes`); UI draft card; typed/spoken “apply that change” / “don’t apply”. P4: stay listening after each turn, one reconnect that does not drop the mic, 10-minute expiry, Always-on chip, spoken stop phrases.

### Verification

- `node --test server/aiAssist/*.test.js` 86/86
- Jest liveClient/service/provider/drawer/liveStatus 89/89 (then liveClient 55/55 after reconnect-guard fix)
- `npx tsc --noEmit` clean; `ai-assist:sync` + `ai-assist:check` clean
- Not runtime-verified in the browser this session. Production flag stays off.

## 2026-08-14 — TJ Medical for Manpower investment/expense unlink

Cleaned the production ₱4,000 `Medical for Manpower` record dated 2026-02-27. Retained TJ Caballero's investment (`94Ax6mMPvcqQKftRL7yZ`), reclassified it from `Project Expense` to `Capital Contribution`, and removed its expense-link fields; deleted the redundant manual `project_expenses` document (`y8UDFEXGlD3L5zZEJsAU`). `LQ26-003-RPP` has no `ca_id` in Firestore, but its six independently linked medical liquidation rows already total ₱6,636. Post-change verification found no remaining forward or backward references between the retained investment and the deleted expense.

## 2026-08-14 — Production Microsoft expense/investment duplicate cleanup

Removed the duplicate Microsoft charge dated 2026-03-14 for ₱494.27 from both `overhead_expenses` and `investments`. Retained the expense categorized as `Communication & Utilities` (`bcHQ7VDVmk5rXep7HcK9`) and its linked investment (`CaYBZ3fAWo04aiGqgqfK`); deleted the `Others` expense (`Heam98P2JtzsGH95QAbG`) and its linked investment (`yPpEXQqZk1nEuf5Tnr1n`) in one guarded Firestore transaction. Post-delete verification confirmed the retained pair remains mutually linked and is the only Microsoft G146867865 record in each collection.

## 2026-08-14 — Hands-free P2: opportunity snapshot and company search

Added `get_opportunity_snapshot` (allowlisted opportunity fields plus linked company id/code/name) and `search_clients` (company name/code only — no contacts, phones, emails, or addresses). Citation chips for clients go to `/sales/clients`. Added three golden-set cases; the set is still unrun against live/emulator data. Invoices and work-schedule tools stay unnamed.

## 2026-08-14 — Hands-free P1.1: see the page on a phone

Replaced the mobile full-screen Assist dialog with a bottom sheet (~56vh, no backdrop, swipe to close) so the record stays visible above it. Desktop Assist is now a persistent dock: the page gets 420px right padding and the drawer no longer modal-blocks the record.

## 2026-08-14 — Hands-free P0: typed lines stay on Live

While a Live session is up, Send no longer stops the mic. The typed line goes into Gemini Live as a completed turn. After Live ends, Flash-Lite chat includes a capped `priorToolResults` payload from this memory-only session so follow-ups like “how many quotations?” still see the last navigate/search. Composer stays enabled during Live. History is still not persisted.

## 2026-08-14 — Hands-free P1: page follows Assist

Implemented the parked P1 slice on `rj/dev` after merging `origin/main` (Work Schedule Gantt). Assist now lives above per-route `AppLayout`, so Live is not remounted on navigation. Citation chips and `navigate_to_record` use an allowlisted navigator. `/projects/:id` is a real route. `pageContext` carries project/opportunity/quotation ids and is sent into an open Live session as an untrusted now-viewing note. Added `list_quotations_for_opportunity`. Assist stays read-only.

### Verification

- `npm run test:ai-assist` 69/69
- Jest AI client suites 62/62
- `tsc --noEmit` clean; `ai-assist:check` clean after Functions sync
- Live browser pass of spoken navigate still needs an RJR/TJC session in the preview

## 2026-08-14 — Hands-free plan reviewed and tightened (still parked)

Reviewed the parked IOCT Assist hands-free roadmap against current Assist code. Direction stays the same (page follows Assist, P1 first, read-only, P5 later). The checklist was too thin to implement: `AiAssistProvider` remounts per route so Live would die on navigate; `pageContext` is `{ route, projectId: null }` and Live never receives it; operational citations use `/projects/:id` which is not a React route; persist-thread contradicted the memory-only design; invoices/work-schedule had no tool names; P3 writes sat before the auth gate. Rewrote `docs/agent/memory/roadmaps/ioct-assist-hands-free.md`. No product code changed.

## 2026-08-14 — Hands-free plan parked for a later session

RJ asked to ready the plan and stop. Canonical parked plan is `docs/agent/memory/roadmaps/ioct-assist-hands-free.md` (also the Bayanihan roadmap **IOCT Assist hands-free**). First implement session is P1 only: wire citation navigation, keep the drawer/Live up, parse pageContext ids, allowlisted “go to this proposal/project.” No code started. Weekly usage was about to max out.

## 2026-08-14 — External LLM/CLI should sit on the operator contract

RJ wants the option to plug a stronger external LLM or CLI into Assist later. Decision: do not open the whole PMv2 API and do not make MCP the source of truth. Freeze the existing allowlisted tool layer as a model-agnostic operator contract (catalog + execute + later navigate/propose), expose it as authenticated HTTP first, then a thin MCP adapter for Claude/Grok/Bayanihan, plus a later in-app provider swap. Auth hardening remains the gate. Added P5 to the hands-free roadmap. No product code changed.

## 2026-08-14 — Hands-free means the page follows Assist

RJ clarified hands-free: the main PMv2 page must move so the user can see what Assist is working on (“go to this proposal / project”). Citation chips already carry routes but `AiAssistDrawer` is mounted without `onNavigateSource`, so taps are a no-op. Updated the **IOCT Assist hands-free** roadmap: P1 is now follow-the-agent navigation (allowlisted React Router, docked drawer, mobile bottom sheet, Now viewing chip). No product code changed.

## 2026-08-14 — IOCT Assist hands-free scout + roadmap

Scouted current Assist vs a Kabayan-style hands-free operator. Confirmed text Flash-Lite and Gemini Live are different model sessions; the drawer can share transcripts after the voice-bubble fix, but Live tool memory does not transfer and typing still calls `stopVoice()`. Rezcoat follow-up “how many quotations” fails because there is no `list_quotations_for_opportunity` tool (`get_quotation_summary` needs a quotation id). Recorded roadmap **IOCT Assist hands-free** (P0 shared session → P1 deeper read tools → P2 navigate-with-confirm → P3 propose-then-confirm drafts → P4 always-on). No product code changed.

## 2026-08-14 — Typed follow-up after voice no longer 502s

Switching from Live to typed chat after a misspelled name failed with “The assistant could not answer that.” Flash-Lite was using JSON `responseSchema` plus function calling, which breaks on follow-ups; the first user message also dropped prior voice turns. Removed JSON-mode, pack conversation history into the first turn, accept prose answers, and match project search on compact spellings (`rezcoat` → `Rez-Coat`). Typed send now ends the live session.

## 2026-08-14 — Live badge on tucked Gemini launcher

The floating Assist FAB now shows a LIVE pill and a mic-level ring while a voice session is running, so the session is visible when the drawer is closed.

## 2026-08-14 — Dedup voice bubbles + single AudioContext

Gemini Live was repeating the finished user/assistant transcript, which created a second pair of bubbles. Replays of the last same-role line now update in place. Capture and playback share one hardware-rate AudioContext (no 24 kHz graph) so Continuity is less likely to drop.

## 2026-08-14 — Live voice is click-to-toggle (Continuity)

Press-and-hold `pointerleave` was stopping the MediaStream and dropping macOS Continuity / iPhone-as-mic. Mic is now click to start, click to stop. Unexpected `track.ended` goes to the error phase.

## 2026-08-14 — AI Assist live-mode mic meter

### Completed

- Live session shows a Live chip, phase label, and a bar meter driven by real microphone RMS.
- Typed composer is disabled while live, with a “speak or click the mic to finish” label.

## 2026-08-14 — AI Assist voice transcript in chat

### Completed

- Enabled Gemini Live `inputAudioTranscription` / `outputAudioTranscription` on the ephemeral token and `live.connect` config.
- Voice input/output text now upserts into the same memory-only chat messages as typed turns, including the standard AI disclaimer and tool source chips.

### Verification

- Token mint with the new transcription fields still succeeds.
- `tsc --noEmit` clean; Jest liveClient/provider/drawer passing.

## 2026-08-14 — AI Assist voice unblock

### Completed

- Default Live model is now `gemini-3.1-flash-live-preview` (`config.js` + local `.env`).
- Removed `lockAdditionalFields` from `liveToken.js` — Gemini 400s it whenever function-calling tools are in the constraints.
- Client sends `liveSessionId` on `/api/ai-assist/tools/:name`; token response type requires it.
- Pointer-up during `connecting` no longer cancels start (mic permission prompt).
- AudioContext is created before `getUserMedia` so it stays in the user-gesture window.

### Verification

- `npm run test:ai-assist` 57/57; `tsc --noEmit` clean; Jest aiAssistService/liveClient/drawer/provider 24/24; `ai-assist:check` clean.
- Local `POST /api/ai-assist/live-token` as allowlisted user: **200** with token + liveSessionId.
- Real microphone conversation not confirmed in the CUI preview browser.

## 2026-08-14 — AI Assist runtime verification

### Completed

- Confirmed local-only enablement (`AI_ASSIST_ENABLED=true` in gitignored `.env`) and that the text path works (RJR manual).
- Runtime-hit `POST /api/ai-assist/live-token` on the live local API: allowlisted user `502 provider_error`, unauthenticated `401`, non-allowlisted `admin` `403`.
- Isolated the 502: Gemini `authTokens.create()` returns `400 field_mask is invalid for BidiGenerateContentSetup` for default `gemini-2.5-flash-native-audio-preview-12-2025` + `lockAdditionalFields`. 3.1 Live accepts that lock list; 2.5 mints only if the field is omitted. Both successful tokens opened a Live WebSocket from Node.
- Documented follow-on voice gaps (PTT/permission race, missing `liveSessionId` on tool POST, silent worklet failures).

### Verification

- No product code changed. No production flag. Paid Gemini calls limited to token mint + two short Node connects.

## 2026-08-13 — Read-only AI Assist chat and voice design

### Completed

- Approved a read-only RJR/TJC first release with no create, edit, approve, submit, upload, or delete authority.
- Chose Gemini 3.5 Flash-Lite for structured text and a configurable Gemini Live native-audio model for push-to-talk voice over one allowlisted server tool layer.
- Designed server-derived citations, constrained ephemeral Live tokens, strict input/output schemas, excluded-data projections, bounded tool use, metadata-only audit, and a feature flag defaulting off.
- Created the design spec, detailed task-by-task implementation plan, Bayanihan source reference map, and a self-contained prompt for a fresh builder CLI session.
- Recorded the existing custom base64-token authentication as a production enablement gate.

### Verification

- Reviewed the artifacts for placeholders, model/config consistency, write-authority leakage, secret exposure, root/Functions deployment mirroring, and overlap with existing dirty worktree changes.
- No application code, dependencies, secrets, or production settings were changed.

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
- Made **Keep both separate** durable so the reviewed pair is suppressed in future possible-match results from either record.
- Protected liquidation-, PO-, payroll-, and CA-owned synced expenses from every resolver mutation and return the exact source link when correction must happen upstream.
- Added append-only `finance_trace_audit` entries with actor, reason, request ID, pair, timestamp, and accurate before/after snapshots.
- Hardened visibility so possible matches and graph traversal never expose another user's inaccessible manual finance records.
- Rejected inactive accounts and scanner-scoped tokens, bounded resolver identifiers/reasons/categories/request IDs, and prevented mutation of unrelated or conflicting pairs.
- Added packaging coverage so the Finance Functions deployment includes runtime trace modules but excludes tests.

### Commits

- `aabc516` — design Finance Money Trail
- `9103adb` — plan Finance Money Trail implementation
- `0d68a1b` through `1bae4bc` — trace contracts, API, resolver, drawer, exact-focus integrations, and module coverage
- `b491197` — harden trace visibility, resolver safety, confirmed-link unlinking, audit snapshots, and staged focus
- `5d6f955` — secure active-session and input boundaries, and persist reviewed pair separation

### Verification

- `node --test server/*.test.js` — 65/65 passed.
- `npm test -- --watchAll=false` — 20 suites, 126/126 passed.
- `npx tsc --noEmit` — passed.
- `npm run build` — compiled successfully.
- `git diff --check` — passed.
- No production Firestore writes were made during implementation or verification.

### Notes

- Work is isolated on `feat/finance-money-trail`, separate from the AI receipt-assist branch, and is not merged or deployed.
- Browser QA was not run because the available local startup path can initialize default users unless it is paired with a verified Firestore emulator dataset.
- `npm ci` required a temporary cache because the user npm cache contains root-owned files; install completed without changing dependencies.

## 2026-08-14 — Finance possible-match quality refinement

### Completed

- Required every possible match to include semantic identity through meaningful description/vendor overlap or an exact supplier, invoice, receipt, or source reference.
- Kept amount, date, project, and investor as supporting evidence only, preventing unrelated Microsoft-versus-RFID/vest suggestions.
- Made the 14-day window a hard rejection when both records have valid dates.
- Preserved centavo and small-peso matching for spelling variants and strong references.

### Verification

- Terra worker observed two expected failing regression tests before implementation.
- `node --test server/financeTrace.test.js` — 11/11 passed.
- `node --test server/*.test.js` — 68/68 passed.
- Live read-only API check for the ₱240.23 Microsoft record returned only the plausible February 26 Microsoft MSBILL candidate; Easytrip, Lalamove, reflective vest, and out-of-window candidates were absent.
- No production finance records were changed.

## 2026-08-14 — Desktop PDF receipt scanning

### Completed

- Added PDF selection to Expense Monitoring's **Scan One** and **Scan Multiple** desktop flows.
- Defined the current behavior as one selected PDF per receipt/expense; multi-page PDFs are not split into separate items.
- Sent PDFs directly to the existing Gemini receipt parser as `application/pdf` without opening the image cropper.
- Preserved image auto-crop behavior and added mixed batch sequencing that crops only images while parsing PDFs in their original order.
- Preserved PDF bytes and `.pdf` filenames for OneDrive uploads; image scans remain JPEG uploads.
- Added a shared receipt-file policy with a 15 MB PDF limit, supported raster-image validation, generic-MIME extension fallback, and rejection of contradictory MIME types.
- Kept rejected-file feedback visible through crop, parse, and review, and guarded scan results against stale overlapping selections.
- Independent review findings were checked against the real helpers: raw-byte hashing already supports PDFs and `compressForUpload` already bypasses non-images; explicit PDF upload and thumbnail bypasses plus race/validation hardening were added.

### Verification

- Focused receipt policy and batch PDF tests passed, including PDF-only, mixed PDF-image-PDF, skipped-file feedback, size limits, MIME handling, and upload filename rules.
- `npm test -- --watchAll=false` — 22 suites, 134/134 passed.
- `npx tsc --noEmit` — passed.
- `npm run build` — compiled successfully.
- `git diff --check` — passed.
- CUI preview started at `http://localhost:3001`; authenticated file-picker smoke was not completed because the preview was at login and credentials were intentionally not entered into tool logs.
- No production Firestore writes or OneDrive uploads were made during verification.
