# Task Log

## 2026-08-27 — Implemented Dedicated Collected & Settlement Ledger in Collections Dashboard

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
