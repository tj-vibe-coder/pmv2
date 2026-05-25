# Task Log

---

## 2026-05-25 — Calcsheet Quotation PDF Footer Page Number Fix

### Summary

Fixed the quotation PDF footer so dynamic page numbers render correctly. React PDF 4.5.1's `Text` `render` prop was confirmed non-functional in fixed/absolute contexts; switched to pdf-lib post-processing (consistent with all other PDF exports in the app). Also changed the footer issuer text from the short code (`IOCT`/`ACTI`) to the full company name.

### Files Changed

- `src/utils/calcsheet/pdfExport.tsx` — page numbers now stamped via pdf-lib's `PDFDocument.load`/`getPages`/`drawText` after React PDF generates the blob; footer issuer uses `issuer.name` instead of `quotation.kind`; increased `footerLeft` width to 210pt for full company name
- `docs/agent/TASK_LOG.md` — recorded the fix
- `docs/agent/KNOWN_ISSUES.md` — marked as resolved
- `docs/agent/PROJECT_STATE.md` — moved from In Progress to Completed

### Checks Run

- `npx tsc --noEmit`
- `CI=true npm run build`

### Result

Done — user verified

### Notes

- React PDF's `Text` `render` prop is not functional in v4.5.1 (static `render={() => 'Page 1 Of 1'}` test confirmed no output). The pdf-lib post-processing approach is the same pattern used by ServiceReportTab, CompletionCertificateTab, LiquidationFormPage, MaterialRequestFormPage, DeliveryPage, CAFormPage, and PurchaseOrderPage.
- Bundle increased ~205KB (pdf-lib was already a project dependency but not previously loaded in the Calcsheet chunk).

---

## 2026-05-25 — Calcsheet Quotation Footer Reference

### Summary

Updated the quotation PDF footer to show the issuer code, quotation reference, and page count on every page. Raised the footer into the printable area, increased contrast, and changed the implementation to fixed absolute elements so React PDF renders it independently from flowing page content. Repositioned the dynamic page count away from the right edge to avoid clipping.

### Files Changed

- `src/utils/calcsheet/pdfExport.tsx` — changed footer to fixed absolute elements: issuer code, `QTN Ref`, and `Page n Of N`, with higher placement, stronger contrast, and safer page-count positioning
- `docs/agent/TASK_LOG.md` — recorded the footer update

### Checks Run

- `npx tsc --noEmit`
- `CI=true npm run build`

### Result

Partially done

### Notes

- Recommended footer content stays lean and traceable: company/issuer, quotation reference, and page numbering. Optional future additions could include document status (`Draft`/`Issued`) or generated timestamp if revision control becomes stricter.
- User verification showed `IOCT` and `QTN Ref` render, but the dynamic page number still does not appear. Next attempt should replace the separate right-side dynamic text with a single full-width dynamic footer `Text render={...}` or another known-good React PDF page-numbering pattern.

---

## 2026-05-25 — Calcsheet Quotation Header, Spacing, and Date Sent

### Summary

Stopped the full quotation header from repeating on continuation pages so the company name, address, and TIN only appear on the first page. Tightened the Summary top spacing by removing the duplicate margin introduced by the non-splitting Summary wrapper. Added quotation-level `Date Sent` so exports no longer use the project date by default.

### Files Changed

- `src/utils/calcsheet/pdfExport.tsx` — removed the React PDF `fixed` flag from the quotation header and reduced duplicate Summary top spacing
- `src/utils/calcsheet/xlsxExport.ts` — uses quotation `Date Sent`, falling back to generation date
- `src/components/calcsheet/CalcsheetQuotationEditor.tsx` — added `Date Sent` date picker
- `src/types/Quotation.ts` — added optional `dateSent`
- `docs/agent/TASK_LOG.md` — recorded the continuation-page header change

### Checks Run

- `npx tsc --noEmit`
- `CI=true npm run build`

### Result

Done

### Notes

- The footer remains fixed so page numbering still appears on every page.
- Blank `Date Sent` means the export date is the day the PDF/Excel is generated; setting it makes the date stable for that quotation.

---

## 2026-05-25 — Calcsheet Quotation PDF Pagination Guards

### Summary

Prevented awkward quotation PDF page breaks by keeping the Summary table together and keeping the `Terms and Conditions` heading with its first `Scope of Work` content block.

### Files Changed

- `src/utils/calcsheet/pdfExport.tsx` — added React PDF `wrap={false}` guards around the Summary block and Terms opening block
- `docs/agent/TASK_LOG.md` — recorded the pagination fix

### Checks Run

- `npx tsc --noEmit`
- `CI=true npm run build`

### Result

Done

### Notes

- React PDF cannot pre-measure every page break exactly in this component, but non-wrapping blocks cause the renderer to move the whole block to the next page when the remaining space is insufficient.

---

## 2026-05-25 — Calcsheet Export Buttons Re-enable After Save

### Summary

Fixed Calcsheet quotation export buttons remaining disabled after saving. The store now returns the saved quotation object with the updated timestamp, and the editor resets its draft to that saved object after a successful save so dirty state clears immediately.

### Files Changed

- `src/store/quotationStore.ts` — `updateQuotation` now returns the saved quotation object
- `src/components/calcsheet/CalcsheetQuotationEditor.tsx` — resets draft from the returned saved quotation after save
- `docs/agent/TASK_LOG.md` — recorded the fix

### Checks Run

- `npx tsc --noEmit`
- `CI=true npm run build`

### Result

Done

### Notes

- Root cause: store updated `updatedAt` after save, but the editor draft kept the old `updatedAt`, so `isDirty` stayed true and export buttons remained disabled.

---

## 2026-05-25 — Calcsheet PDF General Requirements Display Option

### Summary

Added a quotation-level PDF export option to display General Requirements as a client-facing `1 LOT` total while preserving all GenReq item descriptions line by line. Reduced blue emphasis on A/B/C section bars so the Summary section stands out more, and positioned grouped `1 LOT` totals on the middle visible row instead of the bottom row.

### Files Changed

- `src/types/Quotation.ts` — added `exportGeneralReqtsAsLot`
- `src/components/calcsheet/CalcsheetQuotationEditor.tsx` — added "Export as 1 LOT in PDF" switch in Section A
- `src/utils/calcsheet/pdfExport.tsx` — when enabled, keeps GenReq rows visible but shows `1 LOT` total on the middle GenReq line; manpower-based Engineering Services now uses the same middle-row placement; mutes section bars and keeps Summary blue
- `docs/agent/TASK_LOG.md` — recorded the change

### Checks Run

- `npx tsc --noEmit`
- `CI=true npm run build`

### Result

Done

### Notes

- The option affects PDF output only; cost/margin calculations still use the detailed General Requirements rows.

---

## 2026-05-23 — Project Memory and Documentation Refresh

### Summary

Updated project memory and documentation to reflect recent user-management, report, superadmin, and account-designation behavior.

### Files Changed

- `CLAUDE.md` — documented saved report update/delete, account-driven report/quotation designations, RJR/TJC superadmin state, and duplicate TJC follow-up
- `docs/agent/PROJECT_STATE.md` — updated current focus, completed capabilities, notes, and next priorities
- `docs/product/PRD.md` — updated target users, reports acceptance criteria, and settings/user-management feature requirements
- `docs/architecture/OVERVIEW.md` and `docs/ARCHITECTURE.md` — updated modules, routes, saved-report behavior, and signature source-of-truth notes
- `docs/API.md` — documented settings user-management PATCH fields/validation and current RJR/TJC superadmin state
- `docs/agent/KNOWN_ISSUES.md` — replaced stale Calcsheet uncertainty with duplicate TJC user-record issue
- `docs/agent/TASK_LOG.md` — recorded this documentation refresh

### Checks Run

- Documentation consistency search with `rg`

### Result

Done

### Notes

- No code changes were made for this documentation-only task.

---

## 2026-05-23 — Report and Quotation Designation Refresh

### Summary

Fixed report prepared-by designation refresh so saved browser values are replaced when they match the logged-in user's profile. Updated Calcsheet quotation signing to merge the logged-in user account into the signatory list and use the account designation for matching staff names.

### Files Changed

- `src/components/ReportsPage.tsx` — refreshes prepared-by name/designation from the current logged-in user when applicable
- `src/components/calcsheet/CalcsheetQuotationEditor.tsx` — overrides matching signatory titles from the logged-in user account
- `src/data/quotationClients.ts` — kept fallback seed titles with TJ as `General Manager` and Reuel as `Solutions Manager`
- `docs/agent/TASK_LOG.md` — recorded the change

### Checks Run

- `npx tsc --noEmit`
- `CI=true npm run build`

### Result

Done

### Notes

- Existing quotation records store only names; PDF title resolution now uses the effective signatory list, with the logged-in user account taking precedence when names match by exact or first/last name.
- TJ remains `General Manager`; Reuel remains `Solutions Manager` unless the user account is changed.

---

## 2026-05-23 — Promote RJR and TJC to Superadmin

### Summary

Updated production Firestore `users` records for usernames `RJR` and `TJC` so they have `role: superadmin` and `approved: 1`.

### Files Changed

- `docs/agent/TASK_LOG.md` — recorded the Firestore admin change

### Checks Run

- Firestore query before update
- Firestore update and verification query after update

### Result

Done

### Notes

- `RJR` was changed from `admin` to `superadmin`.
- Two `TJC` user records exist in Firestore; both were already `superadmin` and were verified/updated as `superadmin`.

---

## 2026-05-23 — Saved Report Update/Delete Fix

### Summary

Fixed saved report editing so loading a previous service report and saving updates that report instead of creating a duplicate. Added delete actions for loaded service reports and loaded progress snapshots.
Follow-up: made delete actions visible in saved-report tables and changed the settings sidebar label to "User Management" for discoverability.

### Files Changed

- `src/components/ProjectDetails.tsx` — added localStorage update/delete helpers for service reports and progress snapshots
- `src/components/reports/ServiceReportTab.tsx` — tracks the loaded service report index, updates in place, and shows load/delete actions in a saved reports table
- `src/components/reports/ProgressReportTab.tsx` — shows load/delete actions in a saved progress reports table
- `src/components/Sidebar.tsx` — labels the settings entry as "User Management"

### Checks Run

- `node --check server.js`
- `npx tsc --noEmit`
- `CI=true npm run build`

### Result

Done

### Notes

- "New report" clears the edit state so the next save creates a fresh service report.

---

## 2026-05-23 — Settings User Management

### Summary

Moved admin user management under Settings and expanded it so superadmins can update username, email, name, company position, access role, approval status, and reset passwords.

### Files Changed

- `server.js` — extended `PATCH /api/users/:id` with username/email/password updates, uniqueness checks, email/password validation, and last-superadmin protection
- `src/components/UsersPage.tsx` — added editable username, email, password reset, and clearer company position/access role fields
- `src/components/Sidebar.tsx` — made Settings navigate to user management for superadmins
- `src/App.tsx` — added `/settings/users` and redirected legacy `/users`
- `src/contexts/AuthContext.tsx`, `src/types/User.ts` — allow refreshing the cached current user after self-edits

### Checks Run

- `node --check server.js`
- `npx tsc --noEmit`
- `CI=true npm run build`

### Result

Done

### Notes

- Password reset field is intentionally blank by default; leaving it blank keeps the current password unchanged.

---

## 2026-05-23 — Service Report New Report Action

### Summary

Added an explicit "New report" action to the Service Report tab so users can reset the form after loading an old report or finishing/exporting the current one without leaving and returning to the page.

### Files Changed

- `src/components/reports/ServiceReportTab.tsx` — extracted the form reset flow and added "New report" buttons at the top and in the action row

### Checks Run

- `npx tsc --noEmit`
- `CI=true npm run build`

### Result

Done

### Notes

- The reset clears report date/time/title/activities/remarks/report number and dismisses export feedback. The displayed report number then uses the next saved SR sequence.

---

## 2026-05-23 — Project Edit 500 Fix

### Summary

Fixed `PUT /api/projects/:id` failing with HTTP 500 when editing an existing project whose `client_id` points to the unified `clients` schema.

### Files Changed

- `server.js` — project create/update now support both legacy client fields and unified `name`/`contacts` fields; undefined values are stripped before Firestore writes
- `src/services/dataService.ts` — surfaces local/dev server error details in the edit dialog instead of only the generic 500 label
- `functions/server.js` — mirrored from root server via `scripts/prepare-functions.js`

### Checks Run

- `node scripts/prepare-functions.js`
- `node --check server.js`
- `node --check functions/server.js`
- `npx tsc --noEmit`

### Result

Done

### Notes

- Root cause: the old project route read `client_name` / `contact_person`; unified client docs use `name` / `contacts`, causing `account_name: undefined` and Firestore rejected the update.
- Restart the local server before retesting because port 3001 will keep serving the old loaded code until restarted.

---

## 2026-05-23 — Calcsheet Project List Numbering

### Summary

Standardized Calcsheet-to-Project List creation so operations projects receive `IOCTYYMM###` numbers with a monthly reset, while proposal/customer suffixes remain in the Calcsheet proposal code and OneDrive folder naming.

### Files Changed

- `server.js` — added Philippine-year/month project-number helper and assigned `IOCTYYMM###` on new Calcsheet handoff creates
- `functions/server.js` — mirrored from root server via `scripts/prepare-functions.js`
- `CLAUDE.md` — documented the numbering convention and OneDrive folder-name split
- `docs/agent/PROJECT_STATE.md`, `docs/agent/KNOWN_ISSUES.md` — updated agent memory and documented missing Graphify config
- Several frontend files — removed stale unused imports/helpers and fixed hook dependency warnings so `CI=true npm run build` can pass

### Checks Run

- `node scripts/prepare-functions.js`
- `node --check server.js`
- `node --check functions/server.js`
- `npx tsc --noEmit`
- `CI=true npm run build`

### Result

Done

### Notes

- Existing linked Project List records keep their current `project_no` during forced resync.
- New handoff-created Project List rows omit customer suffixes such as `-SLC`, `-ATI`, and `-ADI`; `qtn_no` and `calcsheet_code` retain the proposal number.
- Graphify is not currently runnable because `.planning/config.json` is missing.

---

## 2026-05-21 — System Documentation & Memory Setup

### Summary

Created comprehensive system documentation (ARCHITECTURE.md, API.md, DATA_MODEL.md) covering all modules, API endpoints, and data models. Consolidated docs into `docs/` folder with subdirectories for architecture, product, agent state, and workflow guides. Set up agent memory infrastructure including CLAUDE.md updates and README_AGENT_MEMORY_SETUP.md.

### Files Changed

- `docs/ARCHITECTURE.md` — new (764 lines): system map, routing, API summary, schema, data flows, gotchas
- `docs/API.md` — new (870 lines): full Express API reference with request/response shapes
- `docs/DATA_MODEL.md` — new (562 lines): entity relationships, field-level schema, computed formulas
- `docs/architecture/OVERVIEW.md` — filled from template with project-specific architecture
- `docs/architecture/ADR-0001-project-foundation.md` — filled from template with tech stack decisions
- `docs/product/PRD.md` — filled from template with product requirements
- `docs/agent/PROJECT_STATE.md` — filled from template with current project state
- `docs/agent/TASK_LOG.md` — initialized with this entry
- `docs/agent/KNOWN_ISSUES.md` — filled with documented issues from codebase review
- `docs/graphify/GRAPHIFY_USAGE.md` — updated with project-specific notes
- `docs/obsidian/OBSIDIAN_WORKFLOW.md` — updated with project-specific notes
- `CLAUDE.md` — updated: React version, docs folder reference, new session work, conventions
- `README_AGENT_MEMORY_SETUP.md` — new: agent onboarding guide for memory system
- `.gitignore` — added `/graphify-out/`
- `docs/CLAUDE_CODE_PREP_GUIDE.md` — moved from root
- `docs/PAYROLL_MODULE_INSTRUCTIONS.md` — moved from root

### Checks Run

- Manual verification of all file contents and line counts
- Git mv for tracked files, mv for untracked

### Result

Done

### Notes

- User imported documentation template scaffolding; all 8 template files filled with project-specific content
- The Calcsheet module (referenced in CLAUDE.md Section 3) may not exist in current branch — not moved/removed pending user confirmation

---

## 2026-04-04 — Project Foundation

### Summary

Initial project setup with React CRA template, TypeScript, MUI v5, and Express backend. Includes Project Monitoring Dashboard, custom auth system, and initial Firestore integration.

### Files Changed

- `src/` — full project scaffolding
- `server.js` — Express backend with auth, projects, clients routes
- `package.json` — dependencies and scripts
- `CLAUDE.md` — initial project memory

### Checks Run

- `npm start` verified working
- `npm run build` passing

### Result

Done

### Notes

- Custom auth using base64 tokens — not Firebase Auth
- Legacy SQLite database used initially, later migrated to Firestore
- Deployed as monolith on Render initially

---

## Initial Calcsheet Module Development

### Summary

Built the Calcsheet quotation/proposal module embedded at `/calcsheet/*`. Imported 38 projects + 66 quotations from historical Excel/PDF data. Integrated OneDrive for proposal/execution folder management.

### Files Changed

- Extensive — see `CLAUDE.md` Section 3 and recent additions for full list
- `src/components/calcsheet/*`, `src/utils/calcsheet/*`, `src/store/quotationStore.ts`
- `server.js` — calcsheet API endpoints
- Multiple migration scripts in `scripts/`

### Result

Done

### Notes

- Calcsheet module may be on a different branch or split into a separate repo — verify current state
- 66 quotations imported, 41 remaining after user-driven IOCT/ACTI dedup
