# Known Issues

---

## Calcsheet quotation PDF footer page number not visible

### Problem

~~The quotation PDF footer shows the issuer code (`IOCT`) and `QTN Ref`, but the dynamic page number text (`Page 1 Of X`) is still not visible in the exported PDF.~~

**Resolved 2026-05-25** — React PDF's `Text` `render` prop is non-functional in v4.5.1. Page numbers are now stamped via pdf-lib post-processing after React PDF generation. Footer issuer text now shows the full company name instead of the short code.

### Cause

React PDF 4.5.1's `Text` `render` prop does not produce any visible output (confirmed with `render={() => 'Page 1 Of 1'}` static test). This affects all fixed/absolute contexts. Every other PDF export in the codebase uses jsPDF's `doc.getNumberOfPages()` page-iteration approach.

### Workaround

N/A — resolved via pdf-lib post-processing.

### Proper Fix

Generate the PDF via React PDF (static footer only: issuer name + QTN ref), then load the blob with `PDFDocument.load()`, iterate pages with `getPages()`, and stamp `Page N of M` via `page.drawText()` at the same right-aligned bottom position (27pt from bottom, 36pt from right). This is consistent with all other PDF exports in the codebase.

### Status

Closed

---

## Graphify config missing

### Problem

Graphify cannot be run from this checkout because `.planning/config.json` is missing.

### Cause

The project has Graphify documentation, but the local Graphify planning/config file has not been created or checked in.

### Workaround

Use `rg`, direct code inspection, and existing docs for navigation until Graphify is configured.

### Proper Fix

Create the project Graphify config and regenerate the graph output after the codebase map settings are confirmed.

### Status

Open

---

## Custom auth — base64 tokens (insecure)

### Problem

Authentication uses base64-encoded `userId:username:timestamp` tokens stored in localStorage. Passwords are stored as base64 (not hashed) in Firestore. Tokens never expire.

### Cause

Custom auth was chosen early for speed over Firebase Auth's complexity.

### Workaround

No workaround. The system is functional but insecure. Tokens are vulnerable to XSS extraction and are trivially decodable.

### Proper Fix

Migrate to Firebase Authentication with proper session management, JWT tokens, and hashed passwords.

### Status

Open

---

## Default user passwords visible in git history

### Problem

Root `server.js` contains plaintext default passwords (`TJC`, `admin`, `user`, `projects`). These are visible in git history. The Cloud Function version (`functions/server.js`) was hardened to use env vars, but root is still exposed.

### Cause

Passwords were initialized in code for simplicity during early development.

### Workaround

Passwords still work. The deployed Cloud Function uses env vars and skips seed when no password env var exists.

### Proper Fix

Rotate all 4 default user passwords in Firestore directly. Optionally clean git history with `git filter-branch`.

### Status

Open — user action needed

---

## Latent `{id: ref.id, ...data}` bug pattern in API responses

### Problem

Some server endpoints return `{...data, id: ref.id}` with the wrong order, causing the stored `id` field to override the Firestore document ID. This causes fresh-create-then-update to 500 because the client sends the wrong ID.

### Cause

JavaScript object-literal spread where `...data` (which may contain its own `id` field) overwrites the corrected `id: ref.id`.

### Workaround

Fixes applied to `calcsheet_projects` and `calcsheet_quotations` endpoints. Pattern still exists in `/api/calcsheet/clients` GET, `/api/calcsheet/presets` GET/POST, and potentially payroll/projects/expense routes.

### Proper Fix

Apply the same fix pattern everywhere: strip `id` from req.body before write; use `{...data, id: ref.id}` order in responses; strip `_stored` on GET.

### Status

Open — not biting yet for most flows

---

## Supplier management is bulk-replace only

### Problem

`POST /api/suppliers` deletes ALL existing suppliers and products, then re-inserts everything. There is no incremental CRUD. If the request fails mid-flight, data is lost.

### Cause

Supplier management was built for initial data seeding, not incremental editing.

### Workaround

Always send the complete dataset. The frontend SuppliersPage handles this internally.

### Proper Fix

Implement proper CRUD endpoints (PATCH for individual supplier/product updates, DELETE for single removals).

### Status

Open

---

## Project filtering fetches all documents

### Problem

`GET /api/projects` fetches ALL projects from Firestore, then applies filters in JavaScript memory. This works for the current dataset but won't scale.

### Cause

Firestore lacks native full-text search and some filter combinations. Server-side JS filtering was the simplest implementation.

### Workaround

Acceptable for current ~150 project dataset.

### Proper Fix

Use Firestore compound queries with composite indexes, or add a search service (Algolia, Typesense) for full-text search.

### Status

Open — not urgent at current scale

---

## Inconsistent timestamp formats across collections

### Problem

Projects use ISO strings (`"2026-01-15T00:00:00.000Z"`) for `created_at`/`updated_at`. Cash advances and liquidations use Unix timestamps (seconds). PO dates are also Unix timestamps. This causes bugs if code assumes one format.

### Cause

Collections were added at different times by different developers without a unified convention.

### Workaround

`dataService.formatDate()` handles both formats. Payroll module uses ISO strings consistently.

### Proper Fix

Standardize on one timestamp format (ISO 8601 or Firestore Timestamps) across all collections.

### Status

Open

---

## No automated test coverage

### Problem

`src/App.test.tsx` exists but has minimal coverage. No tests for API routes, business logic (payrollEngine, taxTable, governmentContrib), or UI components.

### Cause

Project was built quickly with AI assistance, tests were never prioritized.

### Workaround

Manual testing via `npm start` and browser verification.

### Proper Fix

Add unit tests for utility functions (`payrollEngine.ts`, `governmentContrib.ts`, `taxTable.ts`), integration tests for API routes, and component tests for critical UI.

### Status

Open

---

## README.md is outdated

### Problem

`README.md` describes a ~5-component app with mockData.ts and CRA boilerplate structure. The actual app has 32+ components, Firestore, custom auth, payroll module, and complex procurement/expense flows.

### Cause

README was never updated after initial scaffolding.

### Workaround

Use `docs/ARCHITECTURE.md` and `CLAUDE.md` for accurate project information.

### Proper Fix

Rewrite README.md with accurate project description, module list, and getting-started instructions. Link to docs/ for detailed reference.

### Status

Open

---

## Payroll access control is username-based

### Problem

`isPayrollAuthorized()` checks `user.username` values `['TJC', 'RJR']`, not Firebase UIDs or role claims. If a username changes or a new payroll-eligible user is added, the code must be redeployed.

### Cause

Payroll access was implemented before custom claims or role-based access was available.

### Workaround

Usernames TJC and RJR are hardcoded. Works for current team.

### Proper Fix

Move to Firebase custom claims or a Firestore-backed permission model.

### Status

Open

---

## Duplicate default user records

### Problem

Firestore currently has duplicate default-account records for `admin` and `projects`.

Resolved finding: a read-only audit on 2026-05-25 found only one `TJC` record and one `RJR` record.

### Cause

Historical seeding/imports created duplicate records.

### Workaround

Login now chooses a matching active account deterministically when duplicate usernames exist. Leave duplicates in place until the actively used documents are confirmed.

### Proper Fix

Identify active `admin` and `projects` documents by login/session usage and safely remove or merge the duplicates.

### Status

Open — needs user confirmation
