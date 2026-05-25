# Project State

## Current Goal

Build and maintain a comprehensive operations platform for IOCT — consolidating project monitoring, procurement, expense management, payroll, reports, and utilities into a single web application accessible to the IOCT team.

## Current Status

- **Status:** Active development
- **Current phase:** Calcsheet and Project List integration hardening
- **Main focus:** Calcsheet/Project List integration hardening, OneDrive execution-folder continuity, reports polish, and settings/user-management hardening
- **Last updated:** 2026-05-25

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
- RJR and TJC production user records are approved superadmins
- Investment tracker
- System documentation (ARCHITECTURE.md, API.md, DATA_MODEL.md)
- Agent memory setup (README_AGENT_MEMORY_SETUP.md)
- Calcsheet won-proposal handoff into Project List with `IOCTYYMM###` operations numbering
- OneDrive execution folder linking/backfill for Project List records
- Report PDF logo/header polish and service-report upload to execution folders
- Calcsheet quotation signatory titles resolve from the logged-in user account when the signatory matches that user; fallback staff seed keeps TJ as General Manager and Reuel as Solutions Manager
- Calcsheet quotation PDF export now supports `Date Sent`, non-repeating continuation-page header, Summary pagination guard, Terms heading pagination guard, muted A/B/C section bars, and middle-row grouped `1 LOT` display for GenReq/manpower service groups

## In Progress

- Historical OneDrive backfill for older proposals/projects
- Existing Project List number cleanup/remapping where old project codes do not match the chosen operations convention
- Calcsheet quotation PDF footer now includes full company name, QTN Ref, and pdf-lib-post-processed `Page N of M` page numbering on every page

## In Progress

- Historical OneDrive backfill for older proposals/projects
- Existing Project List number cleanup/remapping where old project codes do not match the chosen operations convention

## Next Priorities

1. Remap existing Project List `project_no` values to the agreed `IOCTYYMM###` convention where needed
3. Rotate default user passwords in Firestore (visible in git history)
4. Fix latent `{id: ref.id, ...data}` bug pattern in remaining API endpoints
5. Migrate custom auth to Firebase Auth
6. Add automated test coverage
7. Clean up duplicate `TJC` Firestore user records after confirming which account is actively used

## Blockers

- None currently

## Important Notes

- Local dev writes to production Firestore — be careful with destructive operations
- `npm start` runs both server (3001) and client (3000) concurrently
- The repo's `server.js` is the source of truth; `functions/server.js` is overwritten by the deploy script
- Graphify is currently not configured in this checkout because `.planning/config.json` is missing
- User profile designation is the source of truth for current-user report signatures; refresh/login again after editing user account fields so `/api/auth/me` updates browser cache

## Agent Notes

- Read `CLAUDE.md` first in every session — it's the canonical project memory
- All reference docs are in `docs/` — use them, update them
- The `.gitignore` excludes `/graphify-out/` (auto-generated obsidian notes)
- Don't create new `docs/*.md` files unless explicitly asked — update existing ones
- The Express server has 40+ endpoints across auth, projects, clients, expenses, suppliers, and payroll
