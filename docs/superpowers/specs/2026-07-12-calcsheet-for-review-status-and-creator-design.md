# Calcsheet "For review" Status + Opportunity Creator — Design

**Date**: 2026-07-12
**Status**: Approved by TJ (approach A)
**Scope**: Calcsheet module (types, projects list, project detail, sales home, XLSX export, server project routes)

## Problem

1. The project lifecycle (`draft → sent → won/lost/inactive`) has no stage for a quotation
   that is prepared but awaiting internal sign-off before it goes to the customer.
2. Projects don't record who created the opportunity, so there's no way to see whose
   opportunity a calcsheet project is.

## Decisions (from brainstorming)

- **`for_review` status**: internal review before sending — `draft → for_review → sent`.
  A plain label, no approval workflow, notifications, or permission gating; settable from
  the same status dropdowns as every other status. Displayed as "For review", chip color
  `info`. Not hidden by default (`DEFAULT_HIDDEN_STATUSES` stays `lost`/`inactive`).
- **Creator auto-captured**: the server stamps the creating user on project POST — not
  user-editable. Existing/legacy projects have no value and display `—`. Rejected:
  manually-picked owner field (different feature; YAGNI).
- **Consolidation (targeted cleanup)**: the status list is currently hardcoded in three
  places (the `ProjectStatus` union, `STATUS_OPTIONS` in the projects list, and the XLSX
  export's dropdown formula — flagged by the 2026-07-11 export review). This change makes
  the list runtime-shared so future statuses are a one-line addition.

## Changes

### Types (`src/types/Quotation.ts`)
- `ProjectStatus` union gains `'for_review'` (full set:
  `'draft' | 'for_review' | 'sent' | 'won' | 'lost' | 'inactive'`).
- New runtime export `PROJECT_STATUSES: ProjectStatus[]` in lifecycle order
  `['draft', 'for_review', 'sent', 'won', 'lost', 'inactive']` — single source of truth.
- New runtime export `projectStatusLabel(s: ProjectStatus): string` — `'for_review'` →
  `'For review'`; every other status capitalizes its first letter (current behavior).
- `Project` gains `createdBy?: string` (user id) and `createdByName?: string`.

### Projects list (`src/components/calcsheet/CalcsheetProjects.tsx`)
- `STATUS_OPTIONS` and the local `statusLabel` are replaced by `PROJECT_STATUSES` /
  `projectStatusLabel` imports; `statusColors` gains `for_review: 'info'`.
- New "Created by" column showing `p.createdByName ?? '—'` (not sortable — the existing
  sort keys are untouched).
- The Export list mapping passes `createdBy: p.createdByName ?? ''` through to the export.

### Project detail (`src/components/calcsheet/CalcsheetProjectDetail.tsx`)
- Its status dropdown/chips use the shared list + label helper (whatever local constants
  it has are replaced the same way as the list page).
- The header metadata area shows "Created by <name>" when `createdByName` is present.

### Sales home (`src/components/sales/SalesHomePage.tsx`)

Four concrete per-status touchpoints (audited):
- `statusColors` map gains `for_review: 'info'`, and the recent-projects status `Chip`
  (which currently renders the raw status string) uses `projectStatusLabel`.
- **Open-pipeline KPI** (`status === 'draft' || status === 'sent'`): includes
  `for_review` — an opportunity under internal review is still open pipeline.
- **Monthly trend chart**: currently indexes `row[e.p.status]` over hardcoded
  `{draft, sent, won, lost}` and only filters out `inactive` — an unknown status would
  produce NaN. Row shape becomes `{draft, for_review, sent, won, lost}` with a fifth
  stacked `Bar` labeled "For review" between Draft and Sent, filled with
  `NET_PACIFIC_COLORS.info` (consistent with the chart's existing named-color fills).
- **Funnel** (Draft → Sent → Won): gains a "For review" stage between Draft and Sent,
  same `info` fill.
- The aging-sent table (`status === 'sent'`) is intentionally unchanged — aging starts
  when the quotation actually goes out.

### XLSX export (`src/utils/calcsheet/xlsxExport.ts` + its test)
- The dropdown formula is derived from `PROJECT_STATUSES`
  (`'"' + PROJECT_STATUSES.join(',') + '"'`), so it becomes
  `'"draft,for_review,sent,won,lost,inactive"'` automatically.
- `ProjectListExportRow` gains `createdBy: string`; a **Created By** column is appended
  as the last column (K); autofilter widens to `A1:K1`. Tests updated: dropdown formula,
  header, Created By cell value, autofilter range.

### Server (`server.js`)
- `POST /api/calcsheet/projects`: stamp
  `createdBy: user.id, createdByName: user.full_name || user.username` into the document
  (the handler already has `user` from `requireActiveUser`).
- `PUT /api/calcsheet/projects/:id`: strip `createdBy`/`createdByName` from the update
  body (same defensive pattern as the existing `id` strip) so the field stays factual.
- No status validation exists server-side today and none is added (statuses are a client
  concern); no migration — old docs simply lack the fields.
- The legacy-import endpoint is untouched: imported historicals show `—`, which is
  truthful (the importer didn't create the opportunity).

## Error handling

Nothing new — no new failure paths. Missing creator renders `—`/empty everywhere.

## Verification

- Unit: updated export tests (formula, K-column header/value, autofilter) +
  `projectStatusLabel` cases; `npx tsc --noEmit` clean;
  `CI=true npx react-scripts test --testPathPattern=projectListExport --watchAll=false`.
- Browser walkthrough on the mock API (repo `verify` skill): create a project → Created
  by shows the mock user's name in list + detail; set status For review → info chip in
  list, detail, and sales home; monthly trend renders a For review series without NaN;
  Export list → workbook has Created By column and the 6-status dropdown.

## Out of scope

- Review/approval workflow, notifications, or gating on `for_review`.
- Editable "opportunity owner" distinct from the creator.
- Backfilling creators for the 38 historical projects.
- Server-side status validation.
