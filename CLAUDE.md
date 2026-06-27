# IOCT pmv2 — Claude Code Project Memory

> **🔁 INSTRUCTION FOR CLAUDE (every session)**
>
> 1. **At the start of any session in this repo, read this file first** — it is the canonical project memory. All other `MEMORY.md` files under `~/.claude/projects/-Users-reuelrivera-Documents-Projects-IOCT*` redirect here.
> 2. **After completing any non-trivial work** (new feature, schema change, deploy, security cleanup, bug fix worth remembering, follow-up item resolved, etc.), log it — **append the change to `docs/PROJECT_HISTORY.md`**, not to this file. Update the relevant *structural* section of THIS file only when a stable fact changes (new route/collection, a convention, an active follow-up). Don't bother for typo fixes or one-line tweaks.
> 3. **Keep this file lean — it auto-loads every turn, so stay well under Claude Code's 40k-char limit** (it ballooned to 77k once; the change log was split out on 2026-06-24). Narrative/change history goes in `docs/PROJECT_HISTORY.md`; this file holds only what an agent needs to *operate* (company/repo/deploy facts, where code lives, schema, active follow-ups, conventions). Trim resolved follow-ups out of §5. If a structural section grows huge, split it into a `docs/<topic>.md` and link from here.
> 4. **Never put secrets here.** No passwords, no service account JSON, no real customer contact data. Use placeholders and reference env-var names instead.
> 5. **Before creating or significantly modifying any page/component**, read `docs/DESIGN_PHILOSOPHY.md` first. All new pages must follow the documented design system (gradient KPI cards, Box root, h4 title, `NET_PACIFIC_COLORS`, MUI v7 Grid, etc.). The reference implementation is `src/components/Dashboard.tsx`.
> 6. **Branch workflow — check for conflicts before starting any work**:
>    - RJ (Reuel) always works on `rj/dev`. Never commit directly to `main`.
>    - At the start of every session run `git fetch origin && git log --oneline origin/main..HEAD` to see if `rj/dev` is ahead of `main`, and `git log --oneline HEAD..origin/main` to see if `main` has new commits not yet in `rj/dev`.
>    - If `main` has new commits (teammate pushed), run `git merge origin/main` to pull them in before making new changes. Surface any merge conflicts to RJ before proceeding.
>    - **Before merging `origin/main`, sanity-check the incoming diff** (`git diff --stat HEAD origin/main`). A teammate committing from a stale clone can land a large rollback under an innocuous commit message — if you see unexpected file *deletions* or scrubbed secrets reappearing (`.env.production`, `database/`, `render-env.txt`), STOP and surface to RJ instead of merging. See the 2026-06-09 stale-clone incident in `docs/PROJECT_HISTORY.md`.
>    - When a feature is ready to ship, remind RJ to open a Pull Request from `rj/dev` → `main` on GitHub. Merging the PR triggers the auto-deploy. Do NOT push directly to `main`.

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

**Preferred (CI/CD)**: merge a PR from `rj/dev` → `main` on GitHub. The Actions workflow builds and deploys automatically. Manual dispatch also available from the Actions tab.

**Local fallback** (if CI is unavailable):
```bash
npm run deploy:all       # build + deploy hosting + functions
npm run deploy:web       # build + hosting only
npm run deploy:functions # functions only
```

---

## 3. Calcsheet module (the bulk of recent work)

Calcsheet is the quotation/proposal system embedded at `/calcsheet/*`. As of May 2026 it carries the full historical project archive — **38 projects + 66 quotations** originally imported (currently 41 after user-driven IOCT/ACTI dedup), all tagged `formulaVersion: 'legacy'` with frozen totals snapshots.

### Where things live

- **Routes** (`src/App.tsx`): `/sales/calcsheet/projects`, `/sales/calcsheet/projects/:id`, `/sales/calcsheet/projects/:id/compare`, `/sales/calcsheet/quotations/:id`, `/sales/calcsheet/clients`, `/sales/calcsheet/presets`, `/sales/calcsheet/import-legacy` (moved into the Sales workspace Jun 2026; old `/calcsheet/*` URLs redirect via `RedirectCalcsheet`, preserving params/query/hash)
- **Components** (`src/components/calcsheet/`): `CalcsheetProjects.tsx`, `CalcsheetProjectDetail.tsx`, `CalcsheetQuotationEditor.tsx`, `CalcsheetCompareView.tsx`, `CalcsheetClients.tsx` (redirects to `/sales/clients`), `CalcsheetPresets.tsx`, `CalcsheetLegacyImport.tsx`, `EditableTable.tsx`
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
- `calcsheet_quotation_versions` — pre-save snapshots of quotations (Jun 2026, see "Quotation version history" bullet). One doc per save: `{ quotationId, projectId, savedAt, savedBy, data: <full prior quotation> }`. No composite index (single-field where + in-memory sort). Cascade-deleted with the quotation/project.
- `service_reports` — service report records (migrated from localStorage Jun 2026). Fields: `project_id` (string), `date`, `reportNo`, `title`, `startTime?`, `endTime?`, `activitiesTable?`, `recommendationsTable?`, `photos?`, `approverName?`, `approverDesignation?`, `approverCompany?`, `created_at`, `updated_at`. Composite index: `(project_id ASC, created_at DESC)` defined in `firestore.indexes.json`.

### OneDrive integration (May 2026 session)

End-to-end integration with the corporate shared OneDrive (the `projects@iocontroltech.com` OneDrive for Business drive hosting `00 Proposal/IO Proposal/` and `01 Execution/`).

> **⚠️ UPDATE (2026-06-27): OneDrive is now a SERVER-SIDE app-only integration — per-user MSAL sign-in has been REMOVED.** The client no longer uses `@azure/msal-browser` (dependency dropped); `OneDriveAuthContext.tsx` is a stub that always reports configured+authenticated, `onedriveTokenStore.ts` returns a `'server'` placeholder, and `onedriveFolderService.ts` calls backend proxy endpoints **`/api/onedrive/*`** (health, ensure-folder, child-folder, move, upload, upload-by-id, item, content, thumbnail, by-path, children, share) which authenticate to Graph with an **app-only service account** — nobody signs in. The MSAL / redirect-flow / `acquireTokenWithFallback` / env-var details in the bullets below are **HISTORICAL** (kept for Azure-app context) and no longer describe runtime behavior. See `docs/PROJECT_HISTORY.md` "OneDrive: client MSAL → server-side app-only proxy". Commit `87b68be`.

- **Azure app**: `IOCT pmv2` (Application ID `0f9c22d5-01fa-47ee-9154-6d59ce544da0`, tenant `7e11dcd9-b615-422c-a383-cc810894cf90`, single-tenant SPA). Delegated permissions admin-consented: `Files.ReadWrite.All`, `Sites.ReadWrite.All`, `User.Read`, `offline_access`. SPA redirect URIs cover localhost, `pmv2-851ae.web.app`, and `pm.iocontroltech.com`.
- **MSAL auth**: redirect flow (`loginRedirect`) — popup flow broken by COOP headers between Microsoft login and localhost. `OneDriveAuthContext.tsx` calls `handleRedirectPromise()` on mount; `AuthContext.tsx` hardened to NOT log users out on transient `/api/auth/me` failures so the OAuth round-trip doesn't kick them back to /login.
- **Env vars**: `REACT_APP_ONEDRIVE_CLIENT_ID`, `REACT_APP_ONEDRIVE_TENANT_ID`, `REACT_APP_ONEDRIVE_REDIRECT_URI`, `REACT_APP_ONEDRIVE_DRIVE_OWNER` (= `projects@iocontroltech.com`), `REACT_APP_ONEDRIVE_PROPOSAL_ROOT` (= `00 Proposal/IO Proposal`), `REACT_APP_ONEDRIVE_EXECUTION_ROOT` (= `01 Execution`).
- **Folder lifecycle**: project create → `ensureProposalFolder` (idempotent, canonical-name lookup-first; prefix-match auto-detect for historical mismatches; create only if both miss). Status → `'won'` → `moveProposalToExecution` (PATCH to relocate, preserves item id; drops a `.url` shortcut at the original proposal location). Self-healing on deleted folders: clicking a stale link verifies via Graph; if 404, clears both refs and reverts UI to the "Create" state.
- **OneDrive on Calcsheet project create — now BEST-EFFORT, not required** (revised Jun 2026, supersedes the old "required" behavior): when corporate OneDrive is configured, `addProject` (`quotationStore.ts`) still *tries* to create/link the proposal folder up front and include `proposalFolderId` / `proposalFolderUrl` in the initial project POST — but it **never blocks creation on OneDrive**. If the user isn't signed in, or a token can't be acquired silently, the folder step is skipped (logged as a `[OneDrive]` console warning) and the project saves without a folder; the user links it later from the project detail page. The earlier hard `throw new Error('Could not get OneDrive token…')` / `'Sign in to OneDrive before creating…'` gates were removed. Reason for the change: a colleague hit "Could not get OneDrive token" and couldn't create proposals while RJ (same OneDrive account) could — classic **zombie-authenticated MSAL** state (cached account ⇒ `isAuthenticated === true` so the old sign-in gate passed, but `acquireTokenWithFallback` returned `null` because Azure's 24h SPA-refresh-token cap had expired `acquireTokenSilent` AND `ssoSilent`'s hidden-iframe `login.microsoftonline.com` cookie was blocked by the colleague's browser cookie policy / different origin — MSAL cache is per-origin). `CalcsheetProjects.tsx`: removed `requireOneDriveForProjectCreate`; `save()` captures the returned project and, when OneDrive is configured but `!saved.proposalFolderId`, shows an info `createNotice` snackbar ("link it later from the project page"); the New-project dialog shows a non-blocking info `Alert` with a "Sign in" action when configured but not signed in. **Recovery path for the zombie state**: click "Sign in OneDrive" (interactive `loginRedirect`) to mint a fresh 24h refresh token.
- **Project type additions** (`src/types/Quotation.ts`): `proposalFolderId`, `proposalFolderUrl`, `executionFolderId`, `executionFolderUrl` (all optional strings).
- **UI**: on `CalcsheetProjectDetail`, an OneDrive row offers Sign-in / Open / Create proposal / Promote to execution / Link existing. The "Link existing" dialog now auto-scans for PCS-prefix matches and shows clickable suggestions before falling back to URL paste.
- **Bulk auto-link**: button on the projects list (`Auto-link OneDrive (N)`) runs prefix-match across all unlinked projects sequentially with progress UI — main path for backfilling the 38 historicals.
- **PDF on export**: when the user clicks Export PDF, the same blob is uploaded to the project's folder via `uploadFileToFolderById` (best-effort, never blocks the local download). Snackbar reports success/failure.
- **Auth-callback page**: `public/auth-callback.html` exists from earlier popup-flow attempts; unused with redirect flow but harmless.

### Change history

The phase-by-phase log and the full "Recent additions" change history — OneDrive evolution, Calcsheet/finance/sales features, bug-fix rationale, the 2026-06-09 stale-clone incident, and backups — now live in **`docs/PROJECT_HISTORY.md`**. Read it on demand when you need background on a past change or why something is the way it is.

---

## 4. Security

**Pending user action**: rotate the 4 default user passwords in Firestore (TJC, admin, user, projects) — current values still work but are visible in git history. The committed deploy-prep security cleanup detail is logged in `docs/PROJECT_HISTORY.md`.

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
13. **`server.js` catch-all route moved**: the `/*splat` SPA fallback + `express.static('build')` was moved from line ~2243 to the very end of `server.js` (after all API routes including invoices and investment tracker). When adding new routes in the future, do NOT place the catch-all block before them.
14. **Finance module integration roadmap** (2026-06-25): unified Liquidation/Reimbursement/Investment Tracker/Finance Home/Project Expense Report/Expense Monitoring around the Firestore `project_expenses` collection. **Phases 0–3 ALL DONE + shipped to production 2026-06-25** (PR #13 merged; functions + hosting live — `pmv2-851ae.web.app` serves the Phase 2/3 build, live API HTTP 200). Per-phase detail in `docs/PROJECT_HISTORY.md` ("Finance module integration roadmap"). All three former open items now resolved: (a) the 3 `project_expenses` composite indexes were **superfluous** — every `project_expenses` query is equality-only (`==`) with in-memory sort, served by Firestore automatic single-field indexes (zig-zag merge), so they were **removed from `firestore.indexes.json`** (kept `service_reports` only). One stray `createdBy+projectId+createdAt` index remains in prod from an earlier partial deploy — harmless/unused, delete from console if desired. NOTE: a bare `firebase deploy` (push-to-main path) deploys firestore indexes too; the old 3-index file 409'd on re-creating the stray index (prod's `density: SPARSE_ALL` metadata mismatched the minimal repo def), which aborted the whole deploy before functions/hosting — that's why the PR #13 auto-deploy failed and functions+hosting were shipped via manual `workflow_dispatch` `target=functions`/`target=hosting`. The index removal prevents recurrence. (b) Phase 3 **runtime-verified** on the Firestore emulator (seeded from the 2026-06-25 backup) — CA/liquidation sync, dedup, budget cross-link, and the report/investment-banner all confirmed; plus a browser walkthrough of Finance Home / report / investment / reimbursements / expense-monitoring. (c) Phase 1 server-dedup follow-up — **DONE 2026-06-25**: `POST /api/project-expenses` batch dedup now scopes the `po_sync`/`liquidation_sync` existing-keys fetch by the distinct `projectId`(s) in the batch (per-projectId equality query, no composite index needed), replacing the unbounded full-collection scans; runtime-verified on emulator (re-sync dedups to 0; ₱3,000/2-records consistent across report, investment banner, and expense monitoring). See `docs/PROJECT_HISTORY.md` "Post-roadmap follow-up #14c".

**Deploy gotcha (2026-06-25):** the `deploy.yml` push-to-main step runs a bare `firebase deploy` (all targets: firestore + functions + hosting). firestore deploys FIRST — if an index create 409s, the whole deploy aborts before functions/hosting. The manual `workflow_dispatch` `target` options (`hosting`/`functions`) use `--only` and skip firestore — use those to ship code when firestore indexes are problematic. Also: a successful hosting release can still exit non-zero with `400 ... is the current active version` (firebase-tools retries the release call) — check `firebase hosting:channel:list` last-release time + the live bundle before assuming a hosting deploy actually failed.
15. **Nylle must re-clone after the 2026-06-10 force-restore of `main`** (see the stale-clone incident in `docs/PROJECT_HISTORY.md`): her local clone is the stale one that produced the rollback `b0bd1c4`. Until she runs `git fetch origin && git reset --hard origin/main` (or re-clones fresh), any push from her local risks re-introducing the rollback and the scrubbed secrets. Confirm she has reset before she pushes again. `main` history was rewritten by the force-push, so a plain `git pull` on her side will conflict/diverge — she must hard-reset, not merge.
16. **Company P&L + finance tax slices (2026-06-27, on `rj/dev`)** — see `docs/PROJECT_HISTORY.md` "Company P&L + chart-of-accounts + receipt substantiation". Stable facts now in the codebase: new route **`/finance/pnl`** (`CompanyPnLPage.tsx`) + endpoint **`GET /api/finance/pnl?year=`** (company-wide income statement, in-memory aggregation, no index); `financeCategories.ts` now exports **`PROJECT_EXPENSE_CATEGORIES`** (COGS) / **`OVERHEAD_CATEGORIES`** (OPEX) / derived `EXPENSE_CATEGORIES` / **`INVOICE_TYPES`** / **`ACCOUNT_MAP`** + **`accountFor(category, context?)`** (chart of accounts); `project_expenses` + `overhead_expenses` docs can now carry `supplier`/`invoiceNo`/`invoiceType`/`vat`/`tin` (server already persisted the first 4; `tin` added this session; all surfaced via a "BIR Substantiation (Optional)" accordion in both add-expense forms, auto-filled from the receipt scan). **Locked decisions**: revenue = IOCT's own invoices (accrual, IOCT→ACTI value); IOCT is **non-VAT** for now (3% percentage tax / 2551Q, not 12% VAT — revisit at ₱3M gross). **OPEN decision for RJ**: the P&L endpoint/page is company-wide for any authenticated finance user (matches FinanceHomePage); decide whether to role-gate it (Opus reviewer flagged net-income/margin exposure). **Phase 3 slice A SHIPPED (payroll→overhead sync):** approving a payroll run (`POST /api/payroll/runs/:id/approve`) now posts OFFICE-staff cost to `overhead_expenses` → P&L OPEX (Salaries & Wages = Σ OFFICE grossPay; new **Government Contributions** category + COA 6010 = Σ OFFICE employer SSS/PhilHealth/Pag-IBIG). Idempotent via deterministic doc ids `payroll_sync_{runId}_salaries`/`_govt`. **Known MAJOR gap (reviewer-flagged, caveated on the P&L, tracked as the next slice):** FIELD-crew labor is in neither overhead nor `project_expenses`, so the P&L overstates gross margin — needs FIELD→`project_expenses` COGS sync (new Direct Labor 5xxx category, per-`projectId` allocation). **Deferred finance slices** (not built): FIELD-labor→COGS sync, BIR 2307/EWT register, 2551Q percentage-tax report, RCIT/MCIT income-tax provision, VAT ledgers, AFS/period-close, investment double-count fix, PO→Firestore migration. None of the 2026-06-27 finance work is runtime-verified end-to-end (no authed session against real data).

---

## 6. Conventions

- **Commit messages**: imperative mood, focused on "why", co-authored with Claude as `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` only when the user explicitly asks for a commit.
- **Don't commit unless asked.** Don't push unless asked. Don't deploy unless asked.
- **Don't create new `docs/*.md` or `README*.md`** files unless explicitly asked. `docs/` folder contains the project's canonical reference docs — update existing ones, don't create new ones without approval.
- **Use existing tools**: Read/Edit/Write for files, not `cat`/`sed`/`echo`.
- **Type-check before claiming done**: `npx tsc --noEmit` from repo root (CRA project — may fall back to `npm run build` if tsc isn't configured).
- **Lint check**: `CI=true npm run build` will surface lint errors (CRA treats warnings as errors under CI).
