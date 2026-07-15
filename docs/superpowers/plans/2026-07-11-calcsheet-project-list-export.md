# Calcsheet Project List Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Export list" button to the calcsheet projects list that downloads the currently visible (filtered + sorted) projects as an XLSX status-review checklist.

**Architecture:** A pure workbook builder `buildProjectListWorkbook(rows)` plus a thin `exportProjectListXlsx(rows)` (builder + `file-saver`) in the calcsheet's existing `xlsxExport.ts`, following its ExcelJS pattern. `CalcsheetProjects.tsx` maps its existing `sorted` array (already customer/partner-resolved) to plain display-string rows and calls the util; failures surface through the component's existing `createNotice` snackbar. No server or store changes.

**Tech Stack:** React 19 + TypeScript, MUI v7, ExcelJS 4.4 + file-saver (both already dependencies). Unit tests via the CRA jest harness (`react-scripts test` — see the existing `src/utils/calcsheet/serverGrandTotal.parity.test.ts`). Browser verification on TJ's machine uses the repo-local `verify` skill (client on 3000 via preview tools, mock express API on 3001 — no Firestore creds on this machine).

**Spec:** `docs/superpowers/specs/2026-07-11-calcsheet-project-list-export-design.md`

## Global Constraints

- Exactly 3 files change: `src/utils/calcsheet/xlsxExport.ts`, `src/utils/calcsheet/projectListExport.test.ts` (new), `src/components/calcsheet/CalcsheetProjects.tsx`. No server, store, or type-file changes.
- Worksheet name `Projects`; columns in order: `Code`, `Project Name`, `Customer`, `Partner`, `Date`, `Current Status`, `Ongoing`, `Updated Status`, `Remarks`, `Notes`.
- `Updated Status` data cells start blank and carry list validation with formula exactly `'"draft,sent,won,lost,inactive"'`, `allowBlank: true`.
- Filename exactly `` `calcsheet-projects-${format(new Date(), 'yyyy-MM-dd')}.xlsx` ``.
- Button copy exactly `Export list`; disabled when the visible list is empty or an export is in flight.
- Export content = the component's `sorted` array (current filters + sort), mapped to display strings: date `dd MMM yyyy` or `''`, ongoing `'Yes'`/`'—'`, missing customer/partner/notes → `''`.
- Commits use `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`; push after the final task.
- Type-check with `npx tsc --noEmit` (expect no output). Unit tests: `CI=true npx react-scripts test --testPathPattern=projectListExport --watchAll=false`.

---

### Task 1: Workbook builder + export function (TDD)

**Files:**
- Modify: `src/utils/calcsheet/xlsxExport.ts` (append at end of file)
- Test: `src/utils/calcsheet/projectListExport.test.ts` (new)

**Interfaces:**
- Consumes: `ExcelJS`, `saveAs`, `format` — already imported at the top of `xlsxExport.ts`.
- Produces (Task 2 relies on these exact exports from `../../utils/calcsheet/xlsxExport`):
  - `export interface ProjectListExportRow { code: string; name: string; customer: string; partner: string; date: string; status: string; ongoing: string; notes: string; }`
  - `export function buildProjectListWorkbook(rows: ProjectListExportRow[]): ExcelJS.Workbook`
  - `export async function exportProjectListXlsx(rows: ProjectListExportRow[]): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/calcsheet/projectListExport.test.ts`:

```ts
import { buildProjectListWorkbook, ProjectListExportRow } from './xlsxExport';

const rows: ProjectListExportRow[] = [
  {
    code: 'PCS2601001-ABC-00', name: 'Line 3 automation', customer: 'ABC Corp',
    partner: 'ACTI', date: '05 Jan 2026', status: 'sent', ongoing: 'Yes', notes: 'follow up',
  },
  {
    code: 'PCS2601002-XYZ-00', name: 'SCADA upgrade', customer: 'XYZ Inc',
    partner: '', date: '', status: 'draft', ongoing: '—', notes: '',
  },
];

test('workbook has a Projects sheet with header + one row per project', () => {
  const ws = buildProjectListWorkbook(rows).getWorksheet('Projects')!;
  expect(ws).toBeTruthy();
  expect(ws.getRow(1).getCell(1).value).toBe('Code');
  expect(ws.getRow(1).getCell(8).value).toBe('Updated Status');
  expect(ws.rowCount).toBe(3);
  expect(ws.getRow(2).getCell(1).value).toBe('PCS2601001-ABC-00');
  expect(ws.getRow(2).getCell(6).value).toBe('sent');
  expect(ws.getRow(3).getCell(3).value).toBe('XYZ Inc');
  expect(ws.getRow(3).getCell(7).value).toBe('—');
});

test('Updated Status data cells start blank and carry the status dropdown', () => {
  const ws = buildProjectListWorkbook(rows).getWorksheet('Projects')!;
  for (const r of [2, 3]) {
    const cell = ws.getRow(r).getCell(8);
    expect(cell.value ?? null).toBeNull();
    expect(cell.dataValidation).toMatchObject({
      type: 'list',
      allowBlank: true,
      formulae: ['"draft,sent,won,lost,inactive"'],
    });
  }
});

test('header row is bold, frozen, and autofiltered across all 10 columns', () => {
  const ws = buildProjectListWorkbook(rows).getWorksheet('Projects')!;
  expect(ws.getRow(1).font).toMatchObject({ bold: true });
  expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
  expect(ws.autoFilter).toBeTruthy();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `CI=true npx react-scripts test --testPathPattern=projectListExport --watchAll=false`
Expected: FAIL — `buildProjectListWorkbook` is not exported (TS compile error in the test).

- [ ] **Step 3: Implement the builder + export function**

Append to `src/utils/calcsheet/xlsxExport.ts` (after `exportQuotationXlsx`'s closing brace):

```ts
// ── Project list export (status-review checklist) ──────────────────────────

export interface ProjectListExportRow {
  code: string;
  name: string;
  customer: string;
  partner: string;
  date: string;    // 'dd MMM yyyy' or ''
  status: string;
  ongoing: string; // 'Yes' | '—'
  notes: string;
}

const PROJECT_STATUS_DROPDOWN = '"draft,sent,won,lost,inactive"';

export function buildProjectListWorkbook(rows: ProjectListExportRow[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IOCT Calcsheet';
  wb.created = new Date();

  const ws = wb.addWorksheet('Projects', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Code', width: 20 },
    { header: 'Project Name', width: 45 },
    { header: 'Customer', width: 28 },
    { header: 'Partner', width: 28 },
    { header: 'Date', width: 14 },
    { header: 'Current Status', width: 14 },
    { header: 'Ongoing', width: 9 },
    { header: 'Updated Status', width: 15 },
    { header: 'Remarks', width: 30 },
    { header: 'Notes', width: 40 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = 'A1:J1';

  rows.forEach((r, i) => {
    ws.addRow([r.code, r.name, r.customer, r.partner, r.date, r.status, r.ongoing, null, null, r.notes]);
    // Excel dropdown on the blank Updated Status cell — the whole point of the export.
    ws.getCell(i + 2, 8).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [PROJECT_STATUS_DROPDOWN],
    };
  });

  return wb;
}

export async function exportProjectListXlsx(rows: ProjectListExportRow[]): Promise<void> {
  const wb = buildProjectListWorkbook(rows);
  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `calcsheet-projects-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true npx react-scripts test --testPathPattern=projectListExport --watchAll=false`
Expected: 3 passed. (If `ws.getCell(i + 2, 8)` typing complains, ExcelJS accepts `(row, col)` overloads — but if the installed typings reject it, use `ws.getRow(i + 2).getCell(8)` instead; the test asserts via `getRow(...).getCell(8)` either way.)

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` — expect no output. Then:

```bash
git add src/utils/calcsheet/xlsxExport.ts src/utils/calcsheet/projectListExport.test.ts
git commit -m "feat(calcsheet): project list XLSX export with Updated Status dropdown

buildProjectListWorkbook is pure (unit-tested: cells, dropdown validation,
frozen/bold/autofiltered header); exportProjectListXlsx wraps it with
file-saver. Status-review checklist per the 2026-07-11 spec.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: "Export list" button on the projects list

**Files:**
- Modify: `src/components/calcsheet/CalcsheetProjects.tsx` (imports ~lines 1–24; header-bar actions Stack ~lines 397–439; a handler near `clearFilters` ~line 373)

**Interfaces:**
- Consumes from Task 1: `exportProjectListXlsx(rows: ProjectListExportRow[])` and the `ProjectListExportRow` type from `'../../utils/calcsheet/xlsxExport'`.
- Consumes existing component state: `sorted` (array of `{ p, customer, partner, ... }`), `setCreateNotice` (snackbar: `{ severity: 'error' | ..., message: string }`), `format` from `date-fns` (already imported).
- Produces: nothing downstream.

- [ ] **Step 1: Add imports and state**

Add to the icon imports (after `import CloudSyncIcon ...`):

```tsx
import FileDownloadIcon from '@mui/icons-material/FileDownload';
```

Add to the util imports (the line importing from `'../../utils/calcsheet/calc'` is nearby; add a new line after the `codes` import):

```tsx
import { exportProjectListXlsx } from '../../utils/calcsheet/xlsxExport';
```

Inside the `Projects` component, next to the other `useState` hooks, add:

```tsx
  const [exportingList, setExportingList] = useState(false);
```

- [ ] **Step 2: Add the handler**

Immediately after the `clearFilters` function (~line 376), add:

```tsx
  const handleExportList = async () => {
    setExportingList(true);
    try {
      await exportProjectListXlsx(sorted.map(({ p, customer, partner }) => ({
        code: p.code,
        name: p.name,
        customer: customer?.name ?? '',
        partner: partner?.name ?? '',
        date: p.date ? format(new Date(p.date), 'dd MMM yyyy') : '',
        status: p.status,
        ongoing: p.ongoing ? 'Yes' : '—',
        notes: p.notes ?? '',
      })));
    } catch (err) {
      setCreateNotice({ severity: 'error', message: err instanceof Error ? err.message : 'Export failed.' });
    } finally {
      setExportingList(false);
    }
  };
```

- [ ] **Step 3: Add the button**

In the header-bar actions `Stack` (the one holding "Import legacy" and "New project"), insert BEFORE the "Import legacy" button:

```tsx
          <Button
            variant="outlined"
            startIcon={<FileDownloadIcon />}
            onClick={() => { void handleExportList(); }}
            disabled={exportingList || sorted.length === 0}
          >
            Export list
          </Button>
```

- [ ] **Step 4: Type-check and commit**

Run: `npx tsc --noEmit` — expect no output. There is no component unit-test harness; the browser walkthrough is Task 3. Then:

```bash
git add src/components/calcsheet/CalcsheetProjects.tsx
git commit -m "feat(calcsheet): Export list button downloads visible projects as XLSX

Exports exactly the filtered + sorted rows the user sees; failures surface
via the existing createNotice snackbar.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Browser verification and push

**Files:**
- Create: mock server script in the session scratchpad (NOT in the repo), e.g. `<scratchpad>/mock-api.js`
- No repo files modified.

**Interfaces:**
- Consumes: the feature from Tasks 1–2; repo-local skill `.claude/skills/verify/SKILL.md`.
- Produces: verification evidence — nothing downstream.

- [ ] **Step 1: Start client + mock API per the repo `verify` skill**

Client via preview tools (`pmv2-client`, port 3000). Mock express API on 3001 (repo's own express; CORS origin echo + credentials + `Content-Type,Authorization`; 204 OPTIONS) implementing — per the verify skill, `quotationStore.init()` needs ALL of these to succeed or the store silently falls back to seed data:

- `POST /api/auth/login` / `GET /api/auth/me` → `{ success: true, user: { id: 'u1', username: 'adm', full_name: 'Test Admin', role: 'admin' }, token: 't' }`.
- `GET /api/calcsheet/projects` → array of 3 projects with distinct statuses, e.g. `{ id: 'p1', code: 'PCS2601001-ABC-00', name: 'Line 3 automation', date: '2026-01-05', customerId: 'c1', partnerId: 'c2', salesContactId: null, status: 'sent', ongoing: true, notes: 'follow up', createdAt: '2026-01-05', updatedAt: '2026-01-05' }`, plus `p2` (`status: 'draft'`, `customerId: 'c2'`, no notes) and `p3` (`status: 'won'`, `ongoing: false`).
- `GET /api/calcsheet/quotations` → `[]`; `GET /api/calcsheet/presets` → `[]`; `GET /api/calcsheet/seq` → `{ value: 3 }`.
- `GET /api/clients` and `GET /api/calcsheet/clients` → `[{ id: 'c1', code: 'ABC', name: 'ABC Corp', contacts: [] }, { id: 'c2', code: 'ACT', name: 'ACTI', contacts: [] }]` (check the store's expected response shape — wrap in `{ success, ... }` only if the store reads it that way; mirror what `quotationStore.init()` parses).
- 404 for `/api/users/staff-contacts` and `/api/calcsheet/settings` (caught).

- [ ] **Step 2: Walk the flow**

1. Log in (`#login-username`/`#login-password`, `button[type="submit"]`).
2. Navigate to `http://localhost:3000/sales/calcsheet/projects`.
3. Confirm the **Export list** button renders enabled next to "Import legacy".
4. Click it → a `.xlsx` download fires (in the preview browser, verify via the page not erroring and, if downloads land in a reachable dir, inspect the file; otherwise verify by calling the builder directly — step 3).
5. Apply a Status filter (e.g. only `sent`) → click Export list again.

- [ ] **Step 3: Assert workbook contents**

Downloads inside the preview browser may not land somewhere readable. The unit tests (Task 1) already pin workbook structure; here, verify the component→util mapping end-to-end by evaluating in the page context if downloads are unreachable: temporarily not needed — instead run a node script in the scratchpad that imports nothing from the app but re-checks the DOWNLOADED file only if a real file path exists. If no file is reachable, rely on: (a) Task 1 unit tests for structure, (b) browser click firing without console errors for the wiring, and (c) the button disabling while `sorted.length === 0` (clear all data filters so the list is empty — e.g. filter Status to a value with no rows — and confirm the button disables).

- [ ] **Step 4: Console/network check**

Preview console (error level) clean; only the two optionally-404 endpoints may fail.

- [ ] **Step 5: Push**

```bash
git push
```

Report results with a screenshot of the projects list showing the button. Nothing further to commit.

---

## Self-review notes

- Spec coverage: builder + dropdown + filename (Task 1), button/placement/disabled/snackbar + sorted-rows mapping (Task 2), tsc/unit/browser verification + push (Tasks 1–3). Out-of-scope items (re-import, bulk edit, quotation data) have no tasks — correct.
- Type consistency: `ProjectListExportRow` field names identical in Task 1 (definition/tests) and Task 2 (mapping); `exportProjectListXlsx` signature matches; snackbar shape `{ severity, message }` matches the component's existing `setCreateNotice` usage at line ~260.
- Placeholder scan: all code steps carry full code; Task 3 Step 3 explicitly resolves the "can't reach downloads" contingency instead of hand-waving.
- The mock client shape note in Task 3 Step 1 directs the implementer to mirror `quotationStore.init()`'s parsing rather than guess — deliberate, since the store wraps responses differently per endpoint.
