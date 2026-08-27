# Statement of Account (SOA) Module Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an end-to-end Statement of Account (SOA) monitoring, tracking, and document issuance module in PMV2 to manage consolidated subcontractor billings (e.g. to partner ACTI) and direct client billings, accurately capturing both formal Purchase Order billables and work rendered pending PO issuance.

**Tech Stack:** Node 22, Express 5, Firebase Firestore, React 19, TypeScript, Material UI 7, `@react-pdf/renderer`, `pdf-lib`.

---

## File Structure

### New Types & Utilities
- `src/types/StatementOfAccount.ts` — SOA data structures, line items, footnotes, and status definitions.
- `src/utils/soa/soaCodes.ts` — Reference number generator (`SOA{YYMM}{NNN}-{CLIENT}-{REV}`).
- `src/utils/soa/soaPdfExport.tsx` — React-PDF document template matching `SOA2607001-ACT-00 (1).pdf` pixel-for-pixel.

### New Server / API Files
- `server/soa/soaRouter.js` — Authenticated Express router mounted at `/api/soa`.
- `server/soa/soaSequence.js` — Sequential SOA reference number counter in Firestore.
- `server/soa/soaRouter.test.js` — Node test runner tests for SOA API endpoints.

### New Frontend Services & Components
- `src/services/soaService.ts` — API client for SOA CRUD, sequence fetching, and status updates.
- `src/store/soaStore.ts` — Zustand store for state management, caching, and active selection.
- `src/components/finance/soa/SoaDashboardPage.tsx` — Dashboard with KPI cards, status filters, and SOA data grid.
- `src/components/finance/soa/SoaEditorDialog.tsx` — Modal editor with project auto-import, With/Pending PO grouping, and footnotes.
- `src/components/finance/soa/SoaDetailView.tsx` — SOA inspector with live PDF preview, payment matching, and retro-PO updates.
- `src/components/finance/soa/SoaPdfPreviewDialog.tsx` — Modal preview dialog with download and print actions.

### Modified Files
- `server.js` — Mount `/api/soa` router.
- `src/App.tsx` — Add `/finance/soa` and `/finance/soa/:id` routes.
- `src/components/Sidebar.tsx` — Add Statement of Account navigation item under Finance.
- `src/components/CollectionsDashboard.tsx` — Add link to SOA dashboard for ACTI receivables.
- `docs/agent/TASK_LOG.md` & `docs/agent/PROJECT_STATE.md` — Project memory updates.

---

## Phased Implementation Roadmap

### Phase 1: Data Model & Numbering Architecture
- [ ] **Step 1.1:** Create `src/types/StatementOfAccount.ts` defining `StatementOfAccount`, `SoaItem`, `SoaFootnote`, `SoaStatus`, and summary calculation interfaces.
- [ ] **Step 1.2:** Create `src/utils/soa/soaCodes.ts` with reference numbering helpers (`SOA2607001-ACT-00`), validation, and parsing functions.
- [ ] **Step 1.3:** Create unit tests in `src/utils/soa/soaCodes.test.ts` for numbering and parsing logic.

### Phase 2: Server API & Firestore Storage
- [ ] **Step 2.1:** Create `server/soa/soaSequence.js` with atomic Firestore transaction sequence generation per year/month.
- [ ] **Step 2.2:** Create `server/soa/soaRouter.js` with endpoints:
  - `GET /api/soa` — List all SOAs with status & recipient filters.
  - `GET /api/soa/:id` — Retrieve single SOA with full line items and revision history.
  - `POST /api/soa` — Create new SOA with auto-assigned reference number.
  - `PUT /api/soa/:id` — Update SOA line items, footnotes, or recipient details.
  - `PATCH /api/soa/:id/status` — Transition status (`draft` → `issued` → `for_payment` → `settled`).
  - `POST /api/soa/:id/revise` — Create a new revision (`-01`, `-02`) preserving history.
  - `DELETE /api/soa/:id` — Soft-delete or archive draft SOAs.
- [ ] **Step 2.3:** Create `server/soa/soaRouter.test.js` to verify CRUD, permissions, and sequence assignment.
- [ ] **Step 2.4:** Mount router in `server.js`.

### Phase 3: React-PDF Document Generator
- [ ] **Step 3.1:** Create `src/utils/soa/soaPdfExport.tsx` implementing `@react-pdf/renderer` layout:
  - Left header: IOCT Logo (`/logo-ioct-only.png`), Company name, Laguna address, TIN.
  - Right header: Bold `STATEMENT OF ACCOUNT`, `SOA No.`, `Date`, `Currency`, `Status`.
  - Recipient block: Recipient Name, Attention contact, Phone, Address, Subject.
  - Salutation: `Dear Sir/Ma'am {ContactName},` and standard opening body text.
  - Account Summary Table:
    - Group 1: `With PO` items (PO No., Project/WBS, Description, Date, Amount) + `Sub-total (with PO)` row.
    - Group 2: `Pending PO` items (`N/A *`, Project/WBS, Description, Amount) + `Sub-total (pending PO)` row.
    - Summary Row: Navy banner `TOTAL OUTSTANDING, PhP (VAT-EX)` with grand total.
  - Footnotes: Render custom explanations for `*`, `**`, etc.
  - Signatures: Left: `Prepared by:` (Reuel Joshua Rivera / Solutions Manager), Right: `Received by:` (ACTI representative block).
  - Footer: Left `IO Control Technologie OPC`, Center `SOA Ref: {soaNo}`, Right `Page X of Y`.
- [ ] **Step 3.2:** Add multi-page pagination support using `pdf-lib` (matching `pdfExport.tsx` pattern).

### Phase 4: State Management & Service Layer
- [ ] **Step 4.1:** Create `src/services/soaService.ts` to consume the Express backend.
- [ ] **Step 4.2:** Create `src/store/soaStore.ts` with Zustand for local caching, active SOA editing, and recalculations.

### Phase 5: Frontend UI & Management Dashboard
- [ ] **Step 5.1:** Create `src/components/finance/soa/SoaDashboardPage.tsx`:
  - KPI Cards: Total Outstanding SOA Amount, Total With PO, Total Pending PO, Unsettled Count.
  - Search and filter bar (Status filter: All, For Payment, Settled, Draft; Recipient filter).
  - Material-UI table with status chips, totals, and quick actions.
- [ ] **Step 5.2:** Create `src/components/finance/soa/SoaEditorDialog.tsx`:
  - Header & Recipient selection (pre-populated with ACTI or selectable from `clients`).
  - "Import from Projects" action to pull unbilled milestones from `with_acti` projects.
  - Interactive table to add/edit items, toggle `hasPo`, assign PO numbers, and set footnote flags.
  - Footnotes management drawer.
  - Real-time subtotal and grand total calculations.
- [ ] **Step 5.3:** Create `src/components/finance/soa/SoaDetailView.tsx`:
  - Read/inspect view with embedded PDF preview pane.
  - Quick actions: "Update PO Number" (retroactive PO assignment), "Record Collection/Payment", "Create Revision", "Download PDF", "Print".

### Phase 6: Navigation, App Integration, & Collections Sync
- [ ] **Step 6.1:** Register routes in `src/App.tsx` (`/finance/soa`, `/finance/soa/:id`).
- [ ] **Step 6.2:** Add Statement of Account nav item in `src/components/Sidebar.tsx` under Finance.
- [ ] **Step 6.3:** Wire cross-links in `src/components/CollectionsDashboard.tsx` to view SOAs for partner billings.
- [ ] **Step 6.4:** (Optional) OneDrive auto-upload on SOA issuance to `00 Finance/Statements of Account/YYYY-MM/`.

### Phase 7: Verification & Testing
- [ ] **Step 7.1:** Run backend test suites: `node --test server/soa/*.test.js`.
- [ ] **Step 7.2:** Run TypeScript typecheck: `npm run typecheck` / `npx tsc --noEmit`.
- [ ] **Step 7.3:** Visual PDF test: Generate sample PDF and compare directly with `/Users/reuelrivera/Downloads/SOA2607001-ACT-00 (1).pdf` for 100% visual fidelity.
- [ ] **Step 7.4:** Update `docs/agent/TASK_LOG.md` and `docs/agent/PROJECT_STATE.md`.
