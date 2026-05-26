# IOCT pmv2 — Claude Code Project Memory

> **🔁 INSTRUCTION FOR CLAUDE (every session)**
>
> 1. **At the start of any session in this repo, read this file first** — it is the canonical project memory. All other `MEMORY.md` files under `~/.claude/projects/-Users-reuelrivera-Documents-Projects-IOCT*` redirect here.
> 2. **After completing any non-trivial work** (new feature, schema change, deploy, security cleanup, bug fix worth remembering, follow-up item resolved, etc.), update the relevant section(s) of this file inline before ending the session. Don't bother for typo fixes or one-line tweaks.
> 3. **Keep it scannable**: append to the "Recent additions" section, then promote stable items into the right structural section over time. Trim resolved follow-ups out of the list. Target length ~10 KB max — if a section grows huge, split into a `docs/<topic>.md` and link from here.
> 4. **Never put secrets here.** No passwords, no service account JSON, no real customer contact data. Use placeholders and reference env-var names instead.
> 5. **Before creating or significantly modifying any page/component**, read `docs/DESIGN_PHILOSOPHY.md` first. All new pages must follow the documented design system (gradient KPI cards, Box root, h4 title, `NET_PACIFIC_COLORS`, MUI v7 Grid, etc.). The reference implementation is `src/components/Dashboard.tsx`.

---

## 1. Company context

**IO Control Technologie OPC (IOCT)**
- Startup (registered Jan 2026, SEC Reg. No. 2026010232635-12)
- Specializes in industrial automation, engineering consulting, IT services
- Core PSIC: computer programming / automation + general construction + IT products
- Tech stack: React 19 + TypeScript 4.9 + Material-UI v7 + Node/Express + Firebase Firestore + Firebase Hosting + Cloud Functions
- Team: RJ (Admin Ops), TJ (Sales), Renzel (Engineering), Nylle (Admin/Compliance)
- **Current tagline**: *"Empowering industries with intelligent control solutions."* (revised 2026-05-20; the older *"signals → systems"* is deprecated — do not use in new collateral)

**Strategic partnership: ACTI (Advance Controle Technologie Inc)**
- Industry-established partner with customer relationships
- ACTI sources hardware/materials for large projects; IOCT provides automation/programming services
- Deal structure: ACTI "fronts" projects to customers, IOCT subcontracts services
- You will see ACTI referenced in existing spreadsheets and PDFs — this is intentional

**Dual-quotation business logic (Calcsheet module)**
1. Project opportunity sourced by ACTI or IOCT
2. **IOCT quotation** — IOCT's service costs (what ACTI pays IOCT). Line items: manpower, automation/programming services, tools, licenses
3. **ACTI quotation** — customer-facing (what customer pays ACTI). Line items: hardware (ACTI-sourced) + IOCT services + ACTI overhead/margin
4. Markup/margin negotiated per project (manual input, no fixed formula)
- Line items may overlap or differ between IOCT and ACTI; both reference the same project

---

## 2. Repo layout & deployment

- **Active repo**: `/Users/reuelrivera/Documents/Projects/IOCT pmv2/` (GitHub: `tj-vibe-coder/pmv2`)
- **Documentation**: all project docs live in `docs/` — see `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATA_MODEL.md`, `docs/PAYROLL_MODULE_INSTRUCTIONS.md`, `docs/CLAUDE_CODE_PREP_GUIDE.md`. Agent memory setup guide: `README_AGENT_MEMORY_SETUP.md`.
- **Standalone Calcsheet repo** (`/Users/reuelrivera/Documents/Projects/IOCT Calcsheet/`): **stale**, do not use for new work. Calcsheet is now a module inside pmv2 at `/calcsheet/*`.
- **Historical templates** (`/Users/reuelrivera/Documents/Projects/IOCT Calcsheet/IO Proposal/`): source of truth for legacy imports — parsed in place, never modified.
- **Live URLs**:
  - App: https://pmv2-851ae.web.app (Firebase Hosting)
  - API: https://api-2g62nnt3fa-uc.a.run.app (Cloud Function `api`, us-central1, Node 22, 2nd Gen)
  - Console: https://console.firebase.google.com/project/pmv2-851ae/overview
- **Firebase project**: `pmv2-851ae` (production Firestore — all writes are real)
- **Service account**: `pmv2-851ae-firebase-adminsdk-fbsvc-c4d13e6cb1.json` in repo root (gitignored)
- **Hosting rewrite**: `/api/**` → Cloud Function `api`; everything else → `index.html` (SPA)
- **Predeploy gotcha**: `scripts/prepare-functions.js` copies root `server.js` → `functions/server.js`, **overwriting** any local edits in functions/. Deployed function runs whatever's in root `server.js`. The hardened env-var seed in `functions/server.js` is a no-op once the 4 default users exist in Firestore.

### Run locally

```bash
cd "/Users/reuelrivera/Documents/Projects/IOCT pmv2"
npm start          # boots server (3001) + client (3000) concurrently
npm run kill-ports # if 3000/3001 stuck
```

App at http://localhost:3000. Server writes to **production** Firestore directly.

### Deploy

```bash
npm run deploy:all       # build + deploy hosting + functions
npm run deploy:web       # build + hosting only
npm run deploy:functions # functions only
```

---

## 3. Calcsheet module (the bulk of recent work)

Calcsheet is the quotation/proposal system embedded at `/calcsheet/*`. As of May 2026 it carries the full historical project archive — **38 projects + 66 quotations** originally imported (currently 41 after user-driven IOCT/ACTI dedup), all tagged `formulaVersion: 'legacy'` with frozen totals snapshots.

### Where things live

- **Routes** (`src/App.tsx`): `/calcsheet/projects`, `/calcsheet/projects/:id`, `/calcsheet/projects/:id/compare`, `/calcsheet/quotations/:id`, `/calcsheet/clients`, `/calcsheet/presets`, `/calcsheet/import-legacy`
- **Components** (`src/components/calcsheet/`): `CalcsheetProjects.tsx`, `CalcsheetProjectDetail.tsx`, `CalcsheetQuotationEditor.tsx`, `CalcsheetCompareView.tsx`, `CalcsheetClients.tsx` (redirects to `/clients`), `CalcsheetPresets.tsx`, `CalcsheetLegacyImport.tsx`, `EditableTable.tsx`
- **Types**: `src/types/Client.ts` (unified Client + ClientContact + `resolveContact()`), `src/types/Quotation.ts` (re-exports Client, adds `contactId`)
- **Calc engine** (`src/utils/calcsheet/`): `calc.ts` (legacy short-circuit + `computeTotalsLegacy` fallback), `codes.ts` (`nextProjectSequence`, `assignLegacyCode`), `pdfExport.tsx`, `xlsxExport.ts`, `legacyImport.ts` (Excel parser — handles both dual-sheet PCS and single-sheet ACTI variants), `legacyPdfImport.ts` (PDF snapshot parser), `pdfIssuerDetect.ts` (PDF letterhead → IOCT/ACTI)
- **OneDrive integration** (`src/services/`): `onedriveFolderService.ts` (Graph API folder/file operations against the corporate `projects@iocontroltech.com` drive), `onedriveTokenStore.ts` (non-React singleton so Zustand can read auth state). MSAL setup in `src/contexts/OneDriveAuthContext.tsx` (redirect flow, IOCT-tenant single-tenant).
- **Store** (`src/store/quotationStore.ts`): Zustand; clients from unified `/api/clients`, calcsheet data from `/api/calcsheet/*`. Dedicated `importQuotation(q)` action for legacy imports under an existing project. `addProject` and `updateProject` auto-fire OneDrive folder creation/promotion best-effort.
- **Seed** (`src/data/quotationClients.ts`): codes + company names only — PII intentionally stripped, real data lives in Firestore.
- **Server** (`server.js` + `functions/`): `/api/clients` GET/POST/PUT/DELETE (cascades `account_name` + `client_approver` from primary contact). `/api/calcsheet/{projects|quotations|presets}` plus `/seq` and `/seq/increment`. `/api/calcsheet/import/legacy` writes to unified `clients`. Audit log `/api/calcsheet/import/audit`. `/api/calcsheet/clients` POST/PUT/DELETE return 410 Gone.

### Firestore collections (production pmv2-851ae)
- `clients` (16 docs) — unified, camelCase, multi-contact arrays. The 4 legacy main docs kept their `client_1`...`client_4` IDs.
- `calcsheet_projects` (38 docs)
- `calcsheet_quotations` (~41 docs, all `formulaVersion: 'legacy'`)
- `calcsheet_meta` (sequence counter)
- `calcsheet_presets` (labor rate presets)
- `calcsheet_import_audit` (70+ rows)
- `calcsheet_clients` — **DELETED** (consolidated into `clients`)

### Phases completed

**Phase 0 — Schema + calc-engine foundation.** Extended `Quotation` with `formulaVersion`, `importedFrom`, `legacyTotalsSnapshot`, `generalReqContingencyMode`. Added `Project.ongoing`. `computeTotals(q)` short-circuits to snapshot when legacy. `duplicateQuotation` resets formula to current. Editor: yellow Legacy banner + locked inputs + "Duplicate to revise" CTA.

**Phase 1 — Excel parser + import UI.** `src/utils/calcsheet/legacyImport.ts` (TS) + `scripts/parse-legacy-calcsheet.js` (CLI mirror). Keyword-driven, tolerates row drift. Reads Summary cells directly (no recompute). `CalcsheetLegacyImport.tsx` uses `webkitdirectory` folder picker, runs `pdfIssuerDetect.detectIssuerFromPdf()` via pdfjs-dist@5.4 (worker from jsDelivr CDN) to auto-classify IOCT/ACTI.

**Phase 2 — 31 PCS workbooks imported (CLI driver).** `scripts/bulk-import-pcs.js`. Each project got both IOCT and ACTI (CLI doesn't run pdfjs). 5 codes recovered from folder names (blank/corrupted refNo). 3 new clients auto-created (SNB, ICD, A&J). Sequence collisions resolved by parser making folder authoritative when refNo malformed.

**Phase 2.5 — Client consolidation + multi-contact.** Two parallel client systems collapsed to one. Main `ClientsPage` rewritten with expandable rows. Editor: recipient (client) → contact dropdown (defaults to primary). PDF/Excel use `resolveContact()`. `scripts/migrate-clients-unified.js` merged 4 main + 13 calcsheet docs into 13 unified docs. ADI gained a second contact during merge.

**Phase 3 — 4 ACTI-format projects.** `scripts/bulk-import-acti.js`. Parser variant for the different sheet layout (`Offer - Detailed`, P-XXXX components, S-XXXX services). Codes reassigned: `PCS2511032-EBC-00` (stub), `PCS2512033-LBI-00`, `PCS2512034-ADI-00`, `PCS2512035-ADI-00`. Audit log preserves both original ACTI code and new PCS code.

**Phase 4 — Outliers + reconciliation.** CMRP stub `PCS2508036-TPI-00` (xlsx password-protected). `scripts/reconcile-legacy-import.js` — final result at phase end: **66/66 reconciled within ₱0.01**.

### OneDrive integration (May 2026 session)

End-to-end integration with the corporate shared OneDrive (the `projects@iocontroltech.com` OneDrive for Business drive hosting `00 Proposal/IO Proposal/` and `01 Execution/`).

- **Azure app**: `IOCT pmv2` (Application ID `0f9c22d5-01fa-47ee-9154-6d59ce544da0`, tenant `7e11dcd9-b615-422c-a383-cc810894cf90`, single-tenant SPA). Delegated permissions admin-consented: `Files.ReadWrite.All`, `Sites.ReadWrite.All`, `User.Read`, `offline_access`. SPA redirect URIs cover localhost, `pmv2-851ae.web.app`, and `pm.iocontroltech.com`.
- **MSAL auth**: redirect flow (`loginRedirect`) — popup flow broken by COOP headers between Microsoft login and localhost. `OneDriveAuthContext.tsx` calls `handleRedirectPromise()` on mount; `AuthContext.tsx` hardened to NOT log users out on transient `/api/auth/me` failures so the OAuth round-trip doesn't kick them back to /login.
- **Env vars**: `REACT_APP_ONEDRIVE_CLIENT_ID`, `REACT_APP_ONEDRIVE_TENANT_ID`, `REACT_APP_ONEDRIVE_REDIRECT_URI`, `REACT_APP_ONEDRIVE_DRIVE_OWNER` (= `projects@iocontroltech.com`), `REACT_APP_ONEDRIVE_PROPOSAL_ROOT` (= `00 Proposal/IO Proposal`), `REACT_APP_ONEDRIVE_EXECUTION_ROOT` (= `01 Execution`).
- **Folder lifecycle**: project create → `ensureProposalFolder` (idempotent, canonical-name lookup-first; prefix-match auto-detect for historical mismatches; create only if both miss). Status → `'won'` → `moveProposalToExecution` (PATCH to relocate, preserves item id; drops a `.url` shortcut at the original proposal location). Self-healing on deleted folders: clicking a stale link verifies via Graph; if 404, clears both refs and reverts UI to the "Create" state.
- **OneDrive required on Calcsheet project create**: when corporate OneDrive is configured, `/calcsheet/projects` requires the user to sign in to OneDrive before opening/saving a new Calcsheet project. `addProject` creates or links the proposal folder first and includes `proposalFolderId` / `proposalFolderUrl` in the initial project POST. If OneDrive succeeds but project save fails, an empty/unlinked OneDrive folder may need manual cleanup; the app prefers this over saving a project without a required proposal folder.
- **Project type additions** (`src/types/Quotation.ts`): `proposalFolderId`, `proposalFolderUrl`, `executionFolderId`, `executionFolderUrl` (all optional strings).
- **UI**: on `CalcsheetProjectDetail`, an OneDrive row offers Sign-in / Open / Create proposal / Promote to execution / Link existing. The "Link existing" dialog now auto-scans for PCS-prefix matches and shows clickable suggestions before falling back to URL paste.
- **Bulk auto-link**: button on the projects list (`Auto-link OneDrive (N)`) runs prefix-match across all unlinked projects sequentially with progress UI — main path for backfilling the 38 historicals.
- **PDF on export**: when the user clicks Export PDF, the same blob is uploaded to the project's folder via `uploadFileToFolderById` (best-effort, never blocks the local download). Snackbar reports success/failure.
- **Auth-callback page**: `public/auth-callback.html` exists from earlier popup-flow attempts; unused with redirect flow but harmless.

### Recent additions (post-Phase 4)

- **Sort + filter** on `/calcsheet/projects`: search box (fuzzy across code/name/location/customer/partner), Status/Customer/Year/Formula dropdowns, Ongoing-only toggle, sortable columns, History icon when project has legacy quotations, "X of Y" count + Clear button.
- **Per-project legacy import** on `CalcsheetProjectDetail.tsx`: one "Import legacy" button accepts `.xlsx` or `.pdf` (auto-routed by extension). Store action `importQuotation(q)` POSTs to `/api/calcsheet/quotations`. xlsx dialog shows IOCT/ACTI cards with editable revision (auto-bumped), recipient picker (auto-matched), and **Include VAT** switch (live total updates). PDF dialog is a form with detected fields (kind from letterhead, refCode, date, recipient, section subtotals A/B/C, VAT mode, grand total, terms) — all editable.
- **PDF snapshot parser** (`src/utils/calcsheet/legacyPdfImport.ts`): lazy-loads `pdfjs-dist/legacy/build/pdf.mjs`. Extracts header, recipient block, section subtotals A/B/C (Summary anchor first, treats `-` as zero), grand total, VAT mode. Sanity-tested on `PCS2602004-ACT-00.pdf` (₱256,158 grand total + A 16,758 / B 0 / C 239,400 ✓).
- **Page-wide drag-and-drop** on both per-project page and `/calcsheet/import-legacy`. Bulk import handles folder drops via `webkitGetAsEntry()` (walks tree, patches `webkitRelativePath` so existing grouping works).
- **VAT include/exclude toggle** on both flows (per-project xlsx dialog + bulk import per-row, per-kind). Default: on when source has non-zero VAT; off when already VAT-EX. Tooltip shows full breakdown `VAT-EX X · VAT Y · VAT-IN Z`. At import, when off: snapshot mutated `vat = 0`, `grandTotal = max(0, subtotal − discount)`, `vatPct = 0`.
- **Bulk importer PDF-only fallback**: when a folder has Offer PDFs but no xlsx, `parseLegacyPdf` runs on each PDF and `pdfsToParsedProject` synthesizes a `ParsedProject`. If both IOCT and ACTI PDFs share a folder, they merge into one preview row. Visible "PDF only" chip on those rows.
- **IOCT VAT double-count bug fix** (May 2026): some workbooks (e.g. `PCS2604022/PCS2604021.xlsx`) put `TOTAL PRICE, PHP (VAT-IN)` label in column A on the IOCT sheet. Parser's bare-VAT branch `labelA.includes('vat')` matched the VAT-IN total-price row → vat captured as 155,828.90 → grandTotal computed as 294,961.85 (≈2× correct). Fix: check both columns A and F for "total price", exclude `vat-ex`/`vat-in` suffixes from bare-VAT in either column. Applied to both `legacyImport.ts` and `scripts/parse-legacy-calcsheet.js`.
- **PDF export tweaks**: real RGBA PNG logo (from `logo-ioct.svg` via cairosvg), more header breathing room, column-aligned meta labels, logo bumped 70×22 → 90×28.
- **Editor improvements**: inline-editable Date + Status on project detail (writes through `updateProject`); contact picker dropdown next to recipient picker (defaults to primary, helper text shows email · phone).
- **Collapsible sidebar** (May 2026): `Sidebar.tsx` refactored with expand/collapse toggle. Collapsed width 68 px (icon-only, tooltips on hover), expanded 280 px (full labels). Payroll added to `EXPENSE_MONITORING_PATHS` so its nav group stays highlighted.
- **Scroll-position memory** on `/calcsheet/projects`: sessionStorage key `calcsheet-projects-scroll` saves `window.scrollY` before navigating into a project. On return, a double-`requestAnimationFrame` restores the position after layout commits. `saveScroll()` called from every row's click handlers.
- **Auto-code in Add Project dialog**: code field auto-computes from selected customer + date using `quotationCode(seq, customer.code, '00', date)`. Location auto-fills from the customer's last known location (opt-in — a manual edit locks it). If the user types their own code the auto-value is suppressed. `addProject` in the store now accepts an optional `code` override; when supplied it takes precedence over the auto-generated one.
- **Prepared by / Authorized by autocomplete**: both fields in `CalcsheetQuotationEditor` changed from plain `TextField` to `Autocomplete freeSolo` backed by `salesContacts`. Option dropdown shows position · phone · email as subtext; helper text below the field shows the same for the current value. PDF export updated: hardcoded `IOCT_STAFF` dictionary **removed**, replaced by `lookupStaff(name, salesContacts)` which resolves against the live `salesContacts` seed. `exportQuotationPdf` now takes a `salesContacts: SalesContact[]` parameter.
- **Store hardening**: `updateClient`, `updateProject`, and `updateQuotation` now strip `undefined` values from the patch before calling PUT — prevents Firestore 500 errors when a caller passes partial objects with missing optional fields.
- **Bulk importer VAT toggles per row**: `PreviewRow` in `CalcsheetLegacyImport.tsx` gained `includeVatIOCT` / `includeVatACTI` booleans (default: true when source has non-zero VAT, false when VAT-EX). Per-kind toggles are shown in the preview table row alongside the existing per-kind checkboxes.
- **CORS**: `localhost:5173` (Vite dev server) added to `ALLOWED_ORIGINS` in `functions/server.js`.
- **Save-mode quotation editor**: `CalcsheetQuotationEditor` no longer fires PUT on every keystroke. Edits accumulate in a local `draft` state; explicit **Save** button commits the full draft. Discard reverts. `beforeunload` warns on close. Export PDF/Excel disabled while dirty (tooltip: "Save changes before exporting"). "Duplicate to revise" confirms when dirty (duplication uses last-saved state). Fixed a pre-existing rules-of-hooks bug where `useOneDriveAuth` and the toast state were declared after the early-return guard.
- **ACTI single-sheet parser in-app**: `parseLegacyWorkbook` in `legacyImport.ts` now auto-detects the ACTI variant (workbook has `'Offer - Detailed'` sheet but no `IOCT`/`ACTI` tabs) and runs a ported port of `scripts/parse-legacy-calcsheet.js::parseACTIVariant`. Unlocks importing old single-sheet ACTI quotations (e.g. `ACTI2512-03-RPP …`) via the per-project "Import legacy" button.
- **PDF export tweaks (signature + logo)**: Single signatory block (right side) relabeled **"Authorized by:" → "Prepared by:"**, sourced from `quotation.preparedBy`. IOCT logo swapped to icon-only mark (`public/logo-ioct-only.png`, generated via `qlmanage -t -s 512`), size bumped from 90×28 to 64×64.
- **Payment terms expanded** (no abbreviations). All "30% DP" → "30% Downpayment" etc. New option: **"Back-to-back with end-user payment terms"** (industry-standard pay-when-paid phrasing). New-quotation default also updated. Existing quotations with old "DP" strings show as Custom in the dropdown until re-selected.
- **Sales contact seed updates** (`src/data/quotationClients.ts`): Tyrone James Caballero → **General Manager** (was Sales Manager). Reuel Joshua T. Rivera → **Reuel Joshua Rivera** (no middle initial) with **Solutions Manager** as the fallback title. The logged-in user account now takes precedence for matching Calcsheet signatory titles.
- **Project AM as default signatory**: `createQuotation` looks up the parent project's `salesContactId`, resolves to a `salesContacts` name, and seeds both `preparedBy` and `authorizedBy` on the new quotation. The Autocomplete inputs still allow free editing.
- **Margin display split** (`CalcsheetQuotationEditor`): "Total Margin" now shows **markup-only** (excludes contingency), with the contingency reserve listed separately. Includes the `%` of subtotal alongside the peso value. Both the prominent box (next to GRAND TOTAL) and the internal-breakdown panel updated. Same `marginSummary` useMemo computes both.
- **Server `{id: ref.id, ...data}` bug fix**: GET/POST/PUT for `calcsheet_projects` (and `calcsheet_quotations`) were returning the stored `id` field instead of the Firestore doc id (JS object-literal spread order). Caused fresh-create-then-update to 500 because the client used the wrong id for subsequent calls. Fixes in `server.js`: strip `id` from req.body before write; use `{...data, id: ref.id}` order on response; `_stored` strip on GET. Endpoints now also log Firestore errors. Latent pattern still exists in clients/presets/payroll/expense GETs+POSTs — not biting yet (see follow-ups).
- **Sequence counter derived from data** (`server.js` and `CalcsheetProjects.tsx`): both `/api/calcsheet/seq` and `/seq/increment` now compute next from the actual `code` values across `calcsheet_projects` (max PCS{YYMM}{SEQ} + 1). The `calcsheet_meta/seq` doc is still written as a debug breadcrumb but no longer the source of truth. Client preview matches via `nextProjectSequence(projects.map(p => p.code))`. Fixes drift where legacy bulk imports and manually-assigned 25YY codes pushed real max well beyond the counter.
- **Last-clicked row highlight**: `/calcsheet/projects` saves last-clicked project id in `sessionStorage` (key `calcsheet-projects-last`) alongside the existing scroll-position memory. On return, the row gets a soft blue background, 3px left accent border, and a "Last" chip next to the code. Clears when a different row is clicked or the tab closes. Designed for the OneDrive-backfill workflow.
- **Legacy cost backfill** (May 2026): `scripts/backfill-legacy-costs.js` re-parses each legacy quotation's source xlsx (`Labor and Gen Reqt` + `Products` sheets) and writes real `generalReqtsCost / componentsCost / laborCost / laborWithContingency / generalReqtsWithContingency` into `legacyTotalsSnapshot`. The original parser stored cost=subtotal as a placeholder, so `marginSummary` and any list-level margin display read as zero for every legacy quotation; this fixes that. Labor cost = Σ(qty × mandays × (dailyRate + allowance)) using fixed columns G/I/J/L/M (workbook's own per-row contingency math is inconsistent, so it's ignored and applied globally from B3). Resolves basename-only `importedFrom.sourceFile` via a recursive index of `IO Proposal/` (in-app uploads carry no full path). Skips `.pdf` imports (no line items) and ACTI-variant workbooks (no B2/B3, different manpower-block layout). Worked around the latent `{id: ref.id, ...data}` bug by spreading data before the doc id. **Applied result**: 15 IOCT/ACTI quotations backfilled, 14 PDF-only + 3 ACTI-variant remain placeholder.
- **IOCT margin column on /calcsheet/projects**: new `ioctMargin(totals)` helper returns `{value, pct}` or null. Picks the latest IOCT quotation per project by revision; computes `(subtotal − discount) − (genReqCost + compCost + laborCost)`. Placeholder detection: returns null when `totalCost === sum(subtotals)` to within ₱0.01 — so un-backfilled legacy doesn't falsely read as zero. New sortable column shows peso value (green ≥ 0, red < 0) + pct, or `—` with tooltip when no cost data.
- **PDF/XLSX source-format chip in CalcsheetProjectDetail**: each legacy quotation row now shows a small chip next to the Legacy chip — `XLSX` (green outline) or `PDF` (red outline) — with tooltip exposing the source filename. Detection by `q.importedFrom?.sourceFile` extension. Makes it obvious which legacy quotations have line-item data and which were captured from PDF snapshots.
- **Cost basis captured at parse time** (commit `33d4890`): `parseLegacyWorkbook` previously stored `cost=subtotal` in `legacyTotalsSnapshot` as a placeholder, so any re-import of a legacy xlsx through the per-project dialog overwrote backfilled cost data with zeros — margin column then read as `—` via the cost-placeholder detector. The cost extractors from `scripts/backfill-legacy-costs.js` are now ported into `src/utils/calcsheet/legacyImport.ts` (`extractLaborCostRaw`, `extractGeneralReqtsCostRaw`, `extractComponentsCostRaw`); `parseOne` overrides the cost fields in the snapshot using the workbook's own `globalContingencyPct` (B3). Components only billed on the ACTI side, so IOCT keeps `componentsCost=0`. Future re-imports carry real margin without needing a separate backfill pass.
- **Calcsheet → Project List handoff**: won Calcsheet proposals can now create/link records in the original `projects` collection via `POST /api/calcsheet/projects/:id/sync-main`. The sync picks the latest **IOCT** quotation grand total as the default contract amount, falling back to latest ACTI only when no IOCT quotation exists. Calcsheet stores `mainProjectId`, `mainProjectNo`, and sync status fields; Project List stores `calcsheet_project_id`, `calcsheet_code`, `calcsheet_quotation_id`, `source_module: 'calcsheet'`, plus `executionFolderId` / `executionFolderUrl` when available. New Project List records created from Calcsheet use operations numbering `IOCTYYMM###` with a monthly reset and no customer suffix (`-SLC`, `-ATI`, `-ADI`, etc. stay out of `project_no`). The proposal/calcsheet code remains in `qtn_no` and `calcsheet_code`; when "Mark Won and Create Project" is used, Project List sync runs first, then the proposal folder is moved to execution and renamed to the operations `project_no`; the proposal root keeps a `.url` shortcut with the original proposal/PCS folder naming. UI guard: changing status to `won` opens a confirmation with Cancel / Mark Won Only / Mark Won and Create Project. Reverting from won does **not** delete the Project List record. Explicit Resync can overwrite mapped fields but preserves the existing Project List `project_no`; normal sync links existing records without overwriting user edits. OneDrive execution-folder promotion is still client-side because it needs the signed-in Microsoft token; when the folder link becomes available from Calcsheet it is copied to the linked Project List record. Main `ProjectDetails` also has Link OneDrive / Link existing controls for older operations projects that need execution-folder backfill.
- **Sales vs operations status split**: Calcsheet `status` remains the proposal outcome (`draft` / `sent` / `won` / `lost`) and must not be repurposed for delivery status. Linked Project List updates copy back read-only operations fields to Calcsheet: `mainProjectStatus`, `mainProjectProgressPercent`, `mainProjectCompletionDate`, `mainProjectStatusSyncedAt`. Calcsheet detail shows this as "Project List status" next to the proposal status. The old visible "Ongoing project" switch was removed from project detail to avoid confusing proposal filtering with engineering progress; the list-only filter remains as "Active proposals only" and uses the same stored `ongoing` boolean.
- **Inactive proposal status**: Calcsheet `ProjectStatus` now includes `inactive` for dormant/on-hold proposals, separate from `lost`. Only `won` triggers Project List sync prompts and OneDrive execution promotion.
- **Delete confirmation dialogs** (May 2026): Both the projects list (`CalcsheetProjects.tsx`) and the per-project quotation table (`CalcsheetProjectDetail.tsx`) now show a confirmation dialog before deleting. Projects dialog warns that all associated quotations will also be permanently deleted; quotation dialog shows the kind and revision. Both are Cancel / Delete with the Delete button in red (`color="error"`).
- **Sequence counter transaction** (May 2026): `POST /api/calcsheet/seq/increment` now uses a Firestore transaction (`runTransaction`) instead of a read-then-write pattern. The `calcsheet_meta/seq` document is now the authoritative counter, atomically incremented under transaction isolation. This prevents a race condition where two rapid project creations (by different users) could both read the same max sequence number and produce duplicate project codes. Applied to both `server.js` and `functions/server.js`.
- **OneDrive execution folder restructuring** (May 2026): `moveProposalToExecution` now creates a parent ops project folder in `01 Execution/` (e.g. `IOCT2605001-LBI Batangas Plant`) and moves the PCS proposal folder inside it as a child subfolder. Standard `Client PO`/`Sales Invoice` subfolders are seeded automatically via `createExecutionProjectSubfolders`. The return shape changed from `{ moved }` to `{ executionFolder, proposalFolder, shortcut }`. Shortcut left at the proposal root points to the execution project folder.
- **Link to existing Project List record** (May 2026): New `POST /api/calcsheet/projects/:id/link-existing` endpoint links a Calcsheet project to an existing Project List record without creating a new one. UI has a searchable dialog (by project number, name, or client) accessible from both the project detail page and the Mark Won confirmation dialog. The Mark Won dialog now has three options: Cancel / Mark Won Only / Link to Existing Project / Mark Won and Create Project.
- **OneDrive desktop app open** (May 2026): `odopen://` protocol links added next to Proposal folder and Project folder buttons to open folders directly in the OneDrive desktop app.
- **Quotation PDF polish** (May 2026): Tighter spacing throughout, section bars now solid PRIMARY fill with white text, `PHP` → `PhP`, UOM forced uppercase, removed alt-row backgrounds from sub-rows.
- **Service Report OneDrive upload**: `ServiceReportTab` export now saves the PDF locally as before, then uploads the same blob to the linked Project List `executionFolderId` via `uploadFileToFolderById` when OneDrive is configured, signed in, and the project has an execution folder link. Missing config/auth/folder shows a warning but does not block local PDF export.
- **Saved report update/delete**: Service reports and progress snapshots are stored per project in localStorage. Loading a saved service report switches Save into **Update report** instead of creating a duplicate. Saved service reports and progress snapshots now render visible saved-report tables with Load and Delete actions. "New report" clears the service-report edit state so the next save creates a fresh report.
- **Account-driven report/quotation designations**: Report prepared-by fields refresh from the logged-in user's `full_name`/`designation` when the saved prepared-by identity matches the current user. Calcsheet quotation editor merges the logged-in user account into `effectiveSalesContacts` and prefers the account designation for exact or first/last-name signatory matches before falling back to `src/data/quotationClients.ts`. This keeps Reuel as **Solutions Manager** and TJ as **General Manager** according to the user account source of truth.
- **Report logo/table polish**: report PDFs (`ServiceReportTab`, `ProgressReportTab`, `CompletionCertificateTab`) now use the IOCT icon-only mark (`public/logo-ioct-only.png`) via `IOCT_ICON_LOGO_PDF_SIZE` instead of the full horizontal logo. Service Report and Progress Report table headers force `helvetica` bold in AutoTable so headers don't render with the odd serif/Arial Narrow fallback while body text can still use Arial Narrow.
- **Calcsheet contact/PDF polish**: Tyrone James Caballero's Calcsheet signatory contact now includes mobile number `+63 969 162 2660`. The quotation editor collapses current-user aliases such as `Reuel Rivera` into the fuller seeded `Reuel Joshua Rivera` contact so duplicate Reuel options do not appear. Quotation PDF Summary total rows now use a muted background and border highlight.
- **User contact numbers + Calcsheet staff sync**: User Management now has an editable `contact_number` field. Auth/user responses include it, and `/api/users/staff-contacts` exposes approved users' full name, designation, email, and contact number to authenticated clients. Calcsheet merges those records into `salesContacts` so signatory emails/contact numbers can come from the user database instead of the static fallback seed.
- **Auth hardening for Calcsheet writes**: `/api/auth/me` now returns HTTP 401 for invalid/inactive tokens so the frontend clears stale cached sessions instead of leaving users apparently logged in but failing protected writes. Login handles duplicate usernames deterministically by choosing a password-matching active account. Calcsheet write routes use a shared active-user check. Read-only Firestore audit on 2026-05-25 found one `TJC`, one `RJR`, and duplicate default records for `admin` and `projects`.
- **Project edit 500 fix**: Project List create/update routes now support both legacy client docs (`client_name`, `contact_person`, `designation`) and unified client docs (`name`, `contacts[]`). Undefined values are stripped before Firestore writes. This fixes editing project codes/details for records with `client_id` after the client-schema consolidation.
- **Settings user management**: Superadmin user management now lives at `/settings/users` (legacy `/users` redirects there). The table edits username, email, full name, company position (`designation`), access role, approval status, and optional password reset. `PATCH /api/users/:id` validates unique username/email, validates password length when provided, and protects against removing access from the last superadmin.
- **RJR/TJC superadmin update**: Production Firestore users with usernames `RJR` and `TJC` are approved superadmins. `RJR` was promoted from admin to superadmin. As of the 2026-05-25 read-only user audit, `TJC` and `RJR` are not duplicated; duplicate default records remain for `admin` and `projects`.

### System documentation (May 2026)

- **`docs/` folder created**: all project reference docs consolidated from root into `docs/` for cleaner repo structure.
- **`docs/ARCHITECTURE.md`** (764 lines): system map covering all 9 modules, routing table, API endpoint summary, Firestore schema, data flow patterns, and key gotchas.
- **`docs/API.md`** (870 lines): full Express API reference — every endpoint with request/response shapes, validation rules, and auth matrix.
- **`docs/DATA_MODEL.md`** (562 lines): entity relationships, field-level details for all 13 collections/interfaces, LocalStorage keys, computed formulas, and migration path.
- **`README_AGENT_MEMORY_SETUP.md`**: agent onboarding guide listing all memory files in priority order with update rules.
- **`.gitignore`**: added `/graphify-out/` to exclude auto-generated Graphify obsidian notes from version control.

### Recent additions (May–June 2026)

- **OneDrive "Open in app" button** (`CalcsheetProjectDetail.tsx`): `DesktopMacIcon` icon button added next to each folder-open button (Proposal folder, Project folder, Proposal docs). Uses `odopen://sync?userEmail=...&weUrl=...` URI scheme to open the folder in the OneDrive desktop app rather than the browser. Requires the OneDrive desktop app to be signed in with `projects@iocontroltech.com` (one-time setup; subsequent clicks go straight to Finder).
- **Collections & Receivables dashboard** (`/collections`): new top-level page for AR tracking. Stores invoice records in a new `invoices` Firestore collection. Each invoice has `invoice_no`, `invoice_date`, `amount`, `payment_terms_days`, `due_date`, `amount_collected`, `collection_date`. Status (`paid` / `partial` / `overdue` / `unpaid`) is computed, never stored. New API endpoints: `GET/POST /api/invoices`, `PUT/DELETE /api/invoices/:id`. New type file: `src/types/Invoice.ts`. Sidebar item "Collections & AR" added between Dashboard and Expense Monitoring. Follows the full design philosophy (gradient KPI cards, `NET_PACIFIC_COLORS`, `stickyHeader` table, etc.).
- **InvestmentTrackerPage redesign**: ported from `GridLegacy` + custom card styles to the standard design system — gradient KPI cards, `Box height:100%` root, `h4` title, `Paper` table with `stickyHeader`, `nth-of-type(odd)` alternating rows, `NET_PACIFIC_COLORS` buttons.
- **Design philosophy documented**: `docs/DESIGN_PHILOSOPHY.md` — mandatory reading before creating or modifying any page. Covers `NET_PACIFIC_COLORS` palette, page structure, KPI card gradients, filter bar, table patterns, Grid v7 API, button/dialog conventions, and anti-patterns. Reference implementation: `src/components/Dashboard.tsx`.

### Backups

`scripts/backup-firestore.js` dumps every collection to `backups/<ISO-timestamp>/`. Most recent before deploy: `backups/2026-05-18T14-19-27/` (703 docs across 16 collections). Restore with `scripts/restore-firestore.js <dir>`.

---

## 4. Security cleanup (committed)

In the deploy-prep commit:
- Plaintext default-user passwords removed from `functions/server.js`, `docs/DATA_MODEL.md`, `docs/API.md`. Function now reads them from env vars (`DEFAULT_USER_{PASSWORD,EMAIL,FULLNAME}_<USERNAME>`); seed is skipped when no password env var is set. Root `server.js` intentionally left as-is (still has plaintext seed — values visible in git history).
- Customer PII stripped from `src/data/quotationClients.ts` (codes + company names + payment terms only) and `scripts/sync-calcsheet-clients.js` (now expects `CLIENT_SEED_PATH` env var).
- Comments mentioning specific contact names in `scripts/migrate-clients-unified.js` genericized.
- `.gitignore`: added `/backups/`, `/.firebase/`, `/.claude/`, `*.bak-*`, legacy-import preview artifacts.
- Plan doc moved: `ok-fizzy-sparrow.md` → `docs/cloud-functions-migration.md`.

**Pending user action**: rotate 4 default user passwords in Firestore (TJC, admin, user, projects) — current values still work but are visible in git history.

---

## 5. Known follow-ups

1. **IOCT/ACTI cleanup**: original 66 quotations → 41 after dedup. Remaining duplicates are user-driven cleanup based on actual issued letterhead.
2. **PCS2602005 customer override**: parser used General Info's "ACT" but folder says ADI (Analog B1P1 facility). Override customer in UI.
3. **Stub projects need manual quotations**: `PCS2511032-EBC-00` (EBECOR), `PCS2508036-TPI-00` (Tann Group SCADA).
4. **Authentication**: not wired into calcsheet endpoints beyond reading `netpacific_token` from localStorage. The legacy import endpoint requires `getCurrentUser(req)` but bulk-import scripts bypass via firebase-admin.
5. **14 kind-not-found reconciliation entries**: pre-existing file-resolution issue in `scripts/reconcile-legacy-import.js` (script can't locate some source xlsx by basename). Unrelated to the VAT fix. Worth a dedicated debug session if data integrity verification matters.
6. **Outdated `firebase-functions` package** in `functions/package.json` — Firebase warns on deploy; upgrade involves breaking changes.
7. **Password rotation** in Firestore (see Security section).
8. **Latent `{id: ref.id, ...data}` bug pattern** in remaining server endpoints: `/api/calcsheet/clients` GET (1467), `/api/calcsheet/presets` GET/POST (1484, 1494), and a handful in payroll/projects/expense routes. Not biting because those flows don't fresh-create-then-update like the OneDrive auto-folder flow does. Apply the same `{...data, id: ref.id}` ordering + strip-id-from-body fix when convenient.
9. **OneDrive backfill of 38 historicals**: in progress — user is iterating through the projects list using the bulk "Auto-link OneDrive" button and the per-project "Link existing" suggestion picker. Folders with names that diverge from the PCS-code prefix convention (e.g. ones whose names start with `ACTI2512-` instead of `PCS…`) will fall through to "create new" and need manual relink.
10. **`salesContacts` Firestore collection** may still have old signatory metadata (for example `Reuel Joshua T. Rivera` with middle initial, or stale staff titles). The local seed and logged-in-user override cover current-user signing, but non-current-user quotation signatories still depend on the store's `salesContacts` data. Either edit the Firestore docs directly or write a one-off migration script if any quotation's signatory lookup misses.
11. **17 legacy quotations have no real cost basis** (margin column shows `—`): 14 were imported from PDF (no line items extractable) and 3 are from the ACTI-variant single-sheet template (no B2/B3, different manpower layout). Options when convenient: extend the in-app PDF import dialog to capture cost basis manually, or hand-edit those quotations' snapshots. The PCS2605031 IOCT quotation came back with a negative margin (subtotal 478k vs cost 660k) — worth a sanity check; could be a revision mismatch between the source xlsx scope and what was actually issued.
12. **Duplicate default user records**: Firestore has duplicate `admin` and `projects` records. Confirm the actively used documents before deleting/merging either record. `TJC` and `RJR` were confirmed non-duplicated in the 2026-05-25 read-only audit.

---

## 6. Conventions

- **Commit messages**: imperative mood, focused on "why", co-authored with Claude as `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` only when the user explicitly asks for a commit.
- **Don't commit unless asked.** Don't push unless asked. Don't deploy unless asked.
- **Don't create new `docs/*.md` or `README*.md`** files unless explicitly asked. `docs/` folder contains the project's canonical reference docs — update existing ones, don't create new ones without approval.
- **Use existing tools**: Read/Edit/Write for files, not `cat`/`sed`/`echo`.
- **Type-check before claiming done**: `npx tsc --noEmit` from repo root (CRA project — may fall back to `npm run build` if tsc isn't configured).
- **Lint check**: `CI=true npm run build` will surface lint errors (CRA treats warnings as errors under CI).
