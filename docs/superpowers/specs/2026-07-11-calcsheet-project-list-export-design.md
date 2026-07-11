# Calcsheet Project List Export — Design

**Date**: 2026-07-11
**Status**: Approved by TJ (approach A)
**Scope**: Calcsheet projects list (`/sales/calcsheet/projects`)

## Problem

There is no way to get the calcsheet project list out of the app. TJ wants to export the
list as a working checklist for reviewing and updating project statuses (draft / sent /
won / lost / inactive) — export only, no re-import; statuses are still updated in the app.

## Decision

Client-side XLSX export using the calcsheet's existing ExcelJS pattern. A new
`exportProjectListXlsx()` in `src/utils/calcsheet/xlsxExport.ts`, triggered from an
"Export list" button on the projects list. Because the export's purpose is a status
review, the sheet carries a blank **Updated Status** column with an Excel data-validation
dropdown (the five `ProjectStatus` values) and a blank **Remarks** column.

Rejected alternative: plain CSV — simpler but loses the dropdown/formatting that makes
the checklist workable.

## Behavior

- **What exports**: exactly the rows currently visible in the list (current filters,
  current sort order) — the component's existing `sorted` array.
- **Columns**: Code, Project Name, Customer, Partner, Date (dd MMM yyyy or blank),
  Current Status, Ongoing (`Yes` / `—`), Updated Status (blank, dropdown validation
  listing `draft,sent,won,lost,inactive`), Remarks (blank), Notes.
- **Workbook**: single worksheet "Projects"; bold header row, frozen at row 1,
  autofilter across all columns; sensible fixed column widths; workbook creator
  "IOCT Calcsheet" (matches the quotation export).
- **Filename**: `calcsheet-projects-<yyyy-MM-dd>.xlsx` via the existing `file-saver`
  dependency.
- **Button**: "Export list" with a download icon, `size="small"` outlined, placed with
  the projects list's existing header-bar actions; disabled when the visible list is
  empty or while an export is in flight.

## Changes (2 files)

1. **`src/utils/calcsheet/xlsxExport.ts`** — add
   `exportProjectListXlsx(rows: ProjectListExportRow[])` where `ProjectListExportRow`
   carries the already-resolved display strings
   (`{ code, name, customer, partner, date, status, ongoing, notes }`). The component
   resolves customer/partner names (it already has `enriched` rows) so the util stays
   presentation-only and needs no store access.
2. **`src/components/calcsheet/CalcsheetProjects.tsx`** — "Export list" button; on click,
   map `sorted` → `ProjectListExportRow[]`, call the util, surface failures via the
   existing snackbar; no other behavior changes.

## Error handling

Export wrapped in try/catch; failure shows the list's existing snackbar with the error
message. No server or store changes anywhere.

## Verification

- `npx tsc --noEmit` clean.
- Browser walkthrough on TJ's machine per the repo `verify` skill (client + mock API on
  3001 serving a few calcsheet projects): click Export list, confirm a file downloads;
  open the workbook (node + ExcelJS in the scratchpad) and assert row contents, the
  Updated Status dropdown validation, and that filtering the list first shrinks the
  exported row set.

## Out of scope

- Re-import / applying statuses from the file (explicitly rejected in brainstorming).
- Bulk status editing in the app.
- Exporting quotation-level data (amounts, margins) — this is a project status list.
