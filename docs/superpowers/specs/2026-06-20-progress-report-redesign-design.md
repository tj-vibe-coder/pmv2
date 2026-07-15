# Progress Report Page Redesign

**Date:** 2026-06-20
**Status:** Approved
**Scope:** `ProgressReportTab.tsx` and parent `ReportsPage.tsx` restructure

## Problem

The Progress Report page (`/reports/progress`) is a single long form with ~15 fields and controls scattered without visual hierarchy. Users must implicitly understand the workflow: build WBS, fill metadata, save snapshot, export PDF. Pain points:

1. No guided flow — everything visible at once with no grouping
2. WBS table (the core task) competes for space with metadata fields
3. Snapshot save/load uses confusing mode-switching (button labels change, info bar appears)
4. Signatory section requires up to 13 individual text inputs
5. Action buttons at the top scroll out of view while editing WBS
6. No validation — blank PDFs can be exported without warning
7. WBS must be built from scratch every time (no templates)
8. Date input is an ambiguous raw text field

## Solution

Restructure the page into **4 collapsible accordion sections** with a **sticky bottom action bar**. No rewrite of the PDF engine or data model — this is a UI/UX restructure layered over the existing state management.

## Architecture

### Existing files modified

| File | Change |
|------|--------|
| `src/components/ProgressReportTab.tsx` | Restructure into accordion layout, add sticky bar, contact cards, WBS templates, inline validation |
| `src/components/ReportsPage.tsx` | Move Report Company radio to the top bar next to project selector |

### No new files required

All changes are within the existing component. The WBS template data can live as a constant at the top of `ProgressReportTab.tsx`.

### Data model

No Firestore schema changes. No API changes. WBS items, snapshots, prepared-by, and report company continue using their existing localStorage keys. Approver state stays in component state. The PDF export function (`buildPdf`) is unchanged — it receives the same data shape.

## Design

### Page Layout

```
┌──────────────────────────────────────────────────────┐
│  Project Selector (Autocomplete)    (IOCT) (ACTI)    │  <- top bar (always visible)
├──────────────────────────────────────────────────────┤
│                                                      │
│  [Accordion] Report Setup            ✓               │
│  [Accordion] Work Breakdown Structure  8 items  ▴    │  <- expanded by default
│  [Accordion] Signatories             ✓               │
│  [Accordion] Saved Reports           3               │
│                                                      │
├──────────────────────────────────────────────────────┤
│  ██████████░░░░ 52%    [Save] [Preview] [Export PDF] │  <- sticky bottom bar
└──────────────────────────────────────────────────────┘
```

### Section 1: Report Setup

A single-row compact section with 3 fields.

**Note:** Report Company (IOCT/ACTI) lives in the **top bar** next to the project selector (in `ReportsPage.tsx`), not inside this accordion. It affects all report tabs so it stays at the page level.

**Fields:**
- **PB #** (`TextField`, type number) — auto-suggests the next number based on saved reports for this project. If saved reports exist with PB1 and PB2, defaults to `3`.
- **Date** (`DatePicker` from `@mui/x-date-pickers`) — replaces the ambiguous text field. Defaults to today. Formatted as `MM/DD/YYYY` in the picker, rendered as `June 20, 2026` in the PDF. Also used as the PDF signature date for both Prepared By and Approved By blocks.

**Auto-expand logic:**
- Expanded if any field is empty (new report).
- Collapsed if all fields are populated (returning to edit).

**Layout:** MUI Grid — PB# (xs=4), Date (xs=8). Single row.

### Section 2: Work Breakdown Structure

The primary workspace. Expanded by default. Gets maximum vertical space when other sections are collapsed.

**Header row:** Template dropdown (left) + "Add Section" button (right).

**WBS Templates** — `Select` dropdown with pre-built structures:

| Template | Structure |
|----------|-----------|
| Automation Project | 1. Engineering Services (Design Docs, PLC Programming, FAT) / 2. Installation (Panel Fabrication, Site Installation, SAT) / 3. Commissioning (System Testing, Handover) |
| Construction Project | 1. Mobilization / 2. Civil Works / 3. Mechanical / 4. Electrical / 5. Testing & Commissioning |
| Service Contract | 1. Assessment / 2. Execution / 3. Documentation & Handover |
| Blank | Empty — start from scratch |

Selecting a template when WBS items already exist shows a confirmation: "Replace current WBS with template? This can't be undone." [Cancel] / [Replace].

Template data is a constant array in `ProgressReportTab.tsx`:

```ts
const WBS_TEMPLATES: Record<string, { code: string; name: string }[]> = {
  automation: [
    { code: '1', name: 'Engineering Services' },
    { code: '1.1', name: 'Design Documents' },
    { code: '1.2', name: 'PLC Programming' },
    { code: '1.3', name: 'Factory Acceptance Test' },
    { code: '2', name: 'Installation' },
    { code: '2.1', name: 'Panel Fabrication' },
    { code: '2.2', name: 'Site Installation' },
    { code: '2.3', name: 'Site Acceptance Test' },
    { code: '3', name: 'Commissioning' },
    { code: '3.1', name: 'System Testing' },
    { code: '3.2', name: 'Handover' },
  ],
  construction: [
    { code: '1', name: 'Mobilization' },
    { code: '1.1', name: 'Site Survey' },
    { code: '1.2', name: 'Equipment Deployment' },
    { code: '2', name: 'Civil Works' },
    { code: '2.1', name: 'Structural' },
    { code: '2.2', name: 'Finishing' },
    { code: '3', name: 'Mechanical' },
    { code: '3.1', name: 'Piping' },
    { code: '3.2', name: 'Equipment Installation' },
    { code: '4', name: 'Electrical' },
    { code: '4.1', name: 'Roughing-in' },
    { code: '4.2', name: 'Termination & Testing' },
    { code: '5', name: 'Testing & Commissioning' },
    { code: '5.1', name: 'Pre-commissioning' },
    { code: '5.2', name: 'Commissioning & Handover' },
  ],
  service: [
    { code: '1', name: 'Assessment' },
    { code: '1.1', name: 'Site Inspection' },
    { code: '1.2', name: 'Report & Recommendations' },
    { code: '2', name: 'Execution' },
    { code: '2.1', name: 'Service Delivery' },
    { code: '2.2', name: 'Verification' },
    { code: '3', name: 'Documentation & Handover' },
    { code: '3.1', name: 'As-built Documentation' },
    { code: '3.2', name: 'Client Acceptance' },
  ],
};
```

**Nested display:** Top-level WBS items (codes without dots: `1`, `2`, `3`) render as **MUI Accordion** sub-sections within the WBS accordion. Their children (codes with dots: `1.1`, `1.2`) are rows inside.

Each parent accordion header shows:
- Section number and name (editable on click)
- Calculated weight % (sum of children)
- Calculated progress % (weighted average of children)
- Delete section button (removes parent + all children, with confirmation)

Each child row shows:
- Auto-assigned code (non-editable, derived from parent + sequence)
- Name (`TextField`, inline)
- Weight % (`TextField`, type number, 0-100)
- Progress % (`TextField`, type number, 0-100)
- Delete row button (icon, no confirmation for single items)

**"Add Section" button:** Creates the next top-level code (if `1` and `2` exist, creates `3`). Adds a parent with one empty child row. Auto-focuses the parent name field.

**"Add Item" button** (inside each parent section): Creates the next child code (if `2.1` and `2.2` exist, creates `2.3`). Auto-focuses the new item's name field.

**Auto-numbering:** Codes are computed, not user-typed. When a child is deleted, remaining children are NOT renumbered (to avoid confusion during editing). Renumbering happens only on template load or explicit user action.

**Footer row:** Shows "Total Weight: X%" and "Overall Progress: Y%" below the last section. Weight total turns red if not 100%.

### Section 3: Signatories

Collapsed by default. Auto-populated from project and user data.

**Prepared By** — read-only contact card:
```
┌─────────────────────────────────────────┐
│  Tyrone James Caballero                 │
│  General Manager · IO Control Technologie│
│  [Edit]                                 │
└─────────────────────────────────────────┘
```

- Auto-populated from the logged-in user's `full_name`, `designation`, and company (IOCT or ACTI based on Report As selection).
- Shown as a compact read-only card. "Edit" link expands into 3 editable `TextField`s for edge cases.
- Data source: `AuthContext` user account, same as current `reportPreparedBy` logic.

**Approved By** — contact card list + autocomplete:

Each approver renders as a card:
```
┌─────────────────────────────────────[✕]─┐
│  Juan Dela Cruz                         │
│  Project Manager · ACTI                 │
│  [Edit]                                 │
└─────────────────────────────────────────┘
```

- **Adding:** `Autocomplete freeSolo` at the bottom, backed by `clientContacts` from the project's linked client record. Selecting a contact creates a card with all fields populated. Typing a custom name creates a card with just the name (designation/company blank, user clicks Edit to fill).
- **Editing:** Clicking "Edit" on a card expands it into 3 inline `TextField`s (name, designation, company). Click outside or press Enter to collapse back.
- **Removing:** X button on the card. No confirmation (easy to re-add).
- **Max 3** enforced — "Add Approver" autocomplete hidden when 3 cards exist.
- **Auto-populate slot 0:** If the project has a resolved client contact (`resolveContact(client, project.client_contact_id)`), the first approver card is pre-filled on mount. Same as current behavior.

**Date removed from this section.** The PDF signature date uses the Report Date from Section 1.

### Section 4: Saved Reports

Collapsed by default. Header badge shows the count of existing reports.

**Simple table layout:**

| PB# | Date | Progress | Actions |
|-----|------|----------|---------|
| PB3 | Jun 20, 2026 | 52% | [Load] [Delete] |
| PB2 | Jun 05, 2026 | 35% | [Load] [Delete] |
| PB1 | May 20, 2026 | 10% | [Load] [Delete] |

- **Load** replaces the current WBS + PB# + date with the saved report's data. If there are unsaved changes, a confirmation dialog appears: "You have unsaved changes. Discard and load PB2?" [Cancel] / [Discard & Load].
- **Delete** shows a confirmation dialog (same as current).
- **No mode-switching.** After loading, the form looks identical to a fresh form. A `loadedSnapshotIndex` state (number | null) tracks which snapshot was loaded. The Save button in the sticky bar works the same — it either creates a new report (if PB# differs from any saved report) or updates the matching saved report (if PB# matches the loaded one). A subtle chip "Editing PB2" appears next to Save in the sticky bar when `loadedSnapshotIndex !== null`.
- **Empty state:** "No saved reports yet. Fill in the WBS above and click Save to create your first report."

### Section 5: Sticky Bottom Bar

`position: sticky; bottom: 0` with `zIndex: 10`, `Paper` with `elevation: 3`, top border using `NET_PACIFIC_COLORS.primary`.

**Layout (single row, space-between):**

Left side:
- Progress bar (`LinearProgress` with label) showing overall completion percentage. Color: green when >=100%, primary otherwise.
- "Editing PB2" chip (only when a loaded report is being modified).

Right side:
- **Save** (`Button`, variant outlined) — creates or updates a report. Disabled with "Saved" label when no unsaved changes. Shows "Save" when changes exist.
- **Preview PDF** (`Button`, variant outlined) — opens PDF in a modal (same as current). Disabled with tooltip "Add WBS items first" when WBS is empty.
- **Export PDF** (`Button`, variant contained, primary color) — downloads locally + uploads to OneDrive if configured. Disabled with tooltip "Save changes first" when there are unsaved changes. Disabled with tooltip "Add WBS items first" when WBS is empty.

**Validation warnings** — shown below the button row as small `Alert severity="warning"` banners:
- "Weight total is X% — should be 100%" (when total weight != 100)
- "No WBS items added" (when WBS array is empty)
- "PB# not set" (when PB# is empty or 0)
- Warnings do NOT block Save (user may be saving a draft). Warnings DO block Export (tooltip explains which issue to fix).

**Dimensions:** ~64px tall (compact). Enough for one row of buttons + one row of optional warnings.

## Interaction Details

### Accordion behavior
- MUI `Accordion` with `TransitionProps={{ unmountOnExit: true }}` for performance.
- Multiple accordions can be open simultaneously (not exclusive — user may want WBS and Signatories open at once).
- WBS accordion expanded by default on mount. Others collapsed.
- Expand/collapse state is ephemeral (not persisted).

### Auto-save draft
- WBS changes continue to auto-save to localStorage on every edit (existing behavior via the `wbsItems` state setter + useEffect). This is the "draft" — unsaved to the snapshot system but preserved across page refreshes.
- The sticky bar's "unsaved changes" detection compares current WBS state against the last-saved snapshot (or empty if no snapshot loaded).

### Keyboard navigation
- Tab through WBS fields (name → weight → progress → next row name).
- Enter on a WBS name field moves to weight. Enter on progress moves to next row's name.
- No new keyboard shortcuts required — standard MUI behavior.

### Responsive behavior
- On screens < 900px (md breakpoint): Report Setup fields stack vertically instead of horizontal row.
- WBS table uses `overflow-x: auto` for very narrow screens.
- Sticky bar buttons stack into two rows on xs screens.

## Migration from current UI

### What stays the same
- All localStorage keys and data shapes unchanged
- `buildPdf()` function unchanged — receives the same parameters
- OneDrive upload flow unchanged
- Approver data sources unchanged (client contacts + resolveContact)
- Snapshot data structure unchanged (`ProgressSnapshot` interface)
- PDF filename format unchanged

### What changes
- Form layout: flat → accordion sections
- Date input: `TextField` → `DatePicker`
- Report company: `Select` → `RadioGroup` (moved to top bar)
- Signatories: individual fields → contact cards with expand-to-edit
- Saved reports: dropdown + mode-switch → table with Load/Delete
- Action buttons: inline at top → sticky bottom bar
- WBS entry: flat table → nested sub-accordions with auto-numbering
- New feature: WBS templates (template constant + Select dropdown)
- New feature: inline validation warnings in sticky bar
- New feature: PB# auto-suggestion

### What's removed
- The "edit mode" info bar and "Cancel edit" / "Update snapshot" separate buttons
- The "Load previous progress" dropdown
- Prepared-by date field (uses report date from Section 1)
- Manual code entry for WBS items (codes are auto-assigned)

## Out of Scope

- Changes to the PDF layout/format (same `buildPdf` output)
- Changes to the data model or Firestore schema
- Changes to `ServiceReportTab` or `CompletionCertificateTab`
- WBS drag-and-drop reordering (future enhancement)
- WBS import from CSV/paste (future enhancement)
- Saving custom WBS templates (future enhancement — current templates are hardcoded)
- Approver templates / saving approver sets (future enhancement)
- Changes to the OneDrive upload flow
- Changes to the billing integration prompts
