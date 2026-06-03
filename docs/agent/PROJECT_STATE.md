# Project State

## Current Goal

Build and maintain a comprehensive operations platform for IOCT — consolidating project monitoring, procurement, expense management, payroll, reports, and utilities into a single web application accessible to the IOCT team.

## Current Status

- **Status:** Active development
- **Current phase:** Calcsheet and Project List integration hardening
- **Main focus:** Collections & AR integration with project monitoring completed; progress update workflow streamlined
- **Last updated:** 2026-06-03

## Completed

- Project Monitoring Dashboard (KPIs, charts, project table, import/export)
- Custom authentication system (login, registration, role-based access)
- Client management with cascading updates to linked projects
- Cash advance request/approval workflow with liquidation tracking
- Procurement suite (material requests, purchase orders, delivery receipts, suppliers, estimates)
- Reports module (progress, service, completion certificates, saved-report update/delete, account-based prepared-by designation)
- OneDrive integration for project file attachments
- Utilities module (EHS documents, ID generator, acknowledgement receipts)
- Payroll module (employee management, PH labor code computation, payslip generation)
- User management (superadmin approvals, user database)
- Settings-based user management with username/email/name/company position/role/password reset editing
- Settings-based user management now includes editable user contact numbers, and Calcsheet staff/signatory contact details hydrate from approved user records when available
- RJR and TJC production user records are approved superadmins
- Custom auth now clears stale invalid cached tokens, login selects an active matching account when duplicate usernames exist, and Calcsheet write routes consistently require an active approved user
- Investment tracker
- System documentation (ARCHITECTURE.md, API.md, DATA_MODEL.md)
- Agent memory setup (README_AGENT_MEMORY_SETUP.md)
- Calcsheet won-proposal handoff into Project List with `IOCTYYMM###` operations numbering
- Calcsheet proposal statuses now include `inactive` to separate dormant/on-hold proposals from `lost`
- Calcsheet project creation requires OneDrive sign-in when corporate OneDrive is configured; proposal folder creation/linking happens before the project record is saved
- OneDrive execution folder linking/backfill for Project List records
- Calcsheet won-proposal OneDrive promotion now creates/links the Project List record first when requested, renames the moved execution folder to the operations `project_no`, and leaves a proposal-root shortcut with the proposal/PCS naming
- Report PDF logo/header polish and service-report upload to execution folders
- Calcsheet quotation signatory titles resolve from the logged-in user account when the signatory matches that user; fallback staff seed keeps TJ as General Manager and Reuel as Solutions Manager
- Calcsheet quotation PDF export now supports `Date Sent`, non-repeating continuation-page header, Summary pagination guard, Terms heading pagination guard, muted A/B/C section bars, and middle-row grouped `1 LOT` display for GenReq/manpower service groups
- Calcsheet labor preset defaults now match the reference manpower sheet for Technician, Electrician, and Safety Officer at ₱1,200 daily rate with ₱250 allowance; existing quotation manpower rows remain frozen to their stored values
- Calcsheet current-formula contingency now excludes General Requirements; Product Contingency seeds Section B rows while allowing per-line overrides; manpower-priced Engineering Services use manpower cost per LOT without an extra labor contingency/markup layer
- Calcsheet Engineering Services can now multiply manpower-priced services by LOT quantity; PDF/XLSX show `qty × unit price = subtotal`
- Calcsheet General Requirements grouped export can now multiply by LOT quantity; PDF/XLSX show `qty × unit price = subtotal`
- Calcsheet quotation PDF export now has a manual `Start Terms on new PDF page` layout control in Terms & Conditions
- Calcsheet delete confirmation dialogs (project and quotation) with red Delete buttons that warn about permanent deletion
- Calcsheet project sequence counter race condition fix using Firestore `runTransaction` for atomic increments
- Investment Tracker moved into Expense Monitoring sidebar group
- OneDrive execution folder restructuring: won proposals now create a parent ops project folder in Execution with the PCS folder as a child subfolder; standard `Client PO`/`Sales Invoice` subfolders seeded automatically
- Calcsheet link-to-existing Project List record: new `POST /api/calcsheet/projects/:id/link-existing` endpoint with searchable dialog (by project number, name, or client); available from both the project detail page and the Mark Won confirmation
- OneDrive desktop app open: `odopen://` protocol links added to both Proposal and Project folder buttons
- Quotation PDF polish: tighter spacing, solid primary section bars with white text, `PHP`→`PhP`, UOM uppercase
- Collections & AR dashboard with invoice scan upload to OneDrive (Sales Invoice subfolder), bidirectional navigation with ProjectDetails (AR summary card → Collections; project name click → ProjectDetails via sessionStorage bridge)
- Lightweight Update Progress dialog in ProjectDetails: percentage slider, PB number, notes, auto-creates progress snapshots and distributes to WBS items
- Server.js catch-all route ordering fix: SPA fallback moved to end of file after all API routes

## In Progress

- Historical OneDrive backfill for older proposals/projects
- Existing Project List number cleanup/remapping where old project codes do not match the chosen operations convention

## Next Priorities

1. Remap existing Project List `project_no` values to the agreed `IOCTYYMM###` convention where needed
3. Rotate default user passwords in Firestore (visible in git history)
4. Fix latent `{id: ref.id, ...data}` bug pattern in remaining API endpoints
5. Migrate custom auth to Firebase Auth
6. Add automated test coverage
7. Clean up duplicate `admin` and `projects` Firestore user records after confirming which documents are actively used

## Blockers

- None currently

## Important Notes

- Local dev writes to production Firestore — be careful with destructive operations
- `npm start` runs both server (3001) and client (3000) concurrently
- The repo's `server.js` is the source of truth; `functions/server.js` is overwritten by the deploy script
- Graphify is currently not configured in this checkout because `.planning/config.json` is missing
- User profile designation is the source of truth for current-user report signatures; refresh/login again after editing user account fields so `/api/auth/me` updates browser cache
- Read-only Firestore user audit on 2026-05-25 found one `TJC` and one `RJR` record; duplicate usernames currently remain for `admin` and `projects`
- **The `/*splat` SPA fallback + `express.static('build')` must be the LAST thing in `server.js`**, after ALL API routes. Placing it before API routes causes Express to match API requests (like `/api/invoices`) against the wildcard and serve `index.html` instead of JSON.

## Agent Notes

- Read `CLAUDE.md` first in every session — it's the canonical project memory
- All reference docs are in `docs/` — use them, update them
- The `.gitignore` excludes `/graphify-out/` (auto-generated obsidian notes)
- Don't create new `docs/*.md` files unless explicitly asked — update existing ones
- The Express server has 40+ endpoints across auth, projects, clients, expenses, suppliers, and payroll
