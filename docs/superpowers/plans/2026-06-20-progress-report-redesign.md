# Progress Report Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Progress Report page from a flat long form into 4 collapsible accordion sections with a sticky bottom action bar, WBS templates, contact card signatories, and inline validation.

**Architecture:** Single-file restructure of `ProgressReportTab.tsx` (~1274 lines) plus a minor change to `ReportsPage.tsx` (move Report Company to the top bar). No new files, no data model changes, no API changes. The `buildPdf` function (lines 322-835) is left untouched — it receives the same data shape. All localStorage keys and snapshot interfaces remain unchanged.

**Tech Stack:** React 19, MUI v7 (Accordion, RadioGroup, Chip, LinearProgress), existing WBS/snapshot helpers from `ProjectDetails.tsx`, jsPDF (untouched).

## Global Constraints

- No new npm dependencies — use native HTML `<input type="date">` via MUI `TextField` (not `@mui/x-date-pickers`)
- Keep all existing localStorage keys and data shapes unchanged (`projectWBS`, `projectProgressSnapshots`, `reportPreparedBy`, `reportCompany`)
- `buildPdf` function signature and body must not change
- `ProgressReportTabProps` interface must remain backward-compatible (no removed props)
- Follow existing `NET_PACIFIC_COLORS` design system
- The `WBSItem` interface (`{ id, code, name, weight, progress }`) is unchanged
- The `ProgressSnapshot` interface (`{ date, pbNumber, wbsItems, overallProgress }`) is unchanged
- WBS codes remain user-editable strings — the existing flat table with indentation-based hierarchy is kept (the spec's nested sub-accordion WBS display is deferred as a future enhancement to reduce risk)
- Type-check with `npx tsc --noEmit` or `CI=true npm run build` before claiming done

---

### Task 1: Move Report Company to ReportsPage top bar and add RadioGroup

This task moves the Report Company selector out of `ProgressReportTab` and into the `ReportsPage` header bar, next to the project selector. It changes from a `Select` dropdown to an inline `RadioGroup` since there are only 2 options.

**Files:**
- Modify: `src/components/ReportsPage.tsx:176-200` (header section)
- Modify: `src/components/reports/ProgressReportTab.tsx:1019-1026` (remove the Report Company `FormControl`)

**Interfaces:**
- Consumes: `reportCompany` and `setReportCompany` state already in `ReportsPage.tsx`
- Produces: Report Company visible in the page header for all tabs; `ProgressReportTab` no longer renders its own Report Company selector

- [ ] **Step 1: Add RadioGroup to ReportsPage header**

In `src/components/ReportsPage.tsx`, add `Radio`, `RadioGroup`, `FormControlLabel` to the MUI imports:

```tsx
import {
  Box,
  Paper,
  Typography,
  TextField,
  Tabs,
  Tab,
  Autocomplete,
  IconButton,
  RadioGroup,
  FormControlLabel,
  Radio,
} from '@mui/material';
```

Then in the header section (around line 186), add the RadioGroup next to the project Autocomplete, inside the same `Paper`:

```tsx
<Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
  <Autocomplete
    options={projects}
    getOptionLabel={(option) => `${option.project_name} (${option.project_no || option.item_no || option.id})`}
    value={selectedProject}
    onChange={(_, newValue) => {
      setSelectedProject(newValue);
      if (newValue) {
        navigate(`/reports/${tab}?projectId=${newValue.id}`);
      }
    }}
    renderInput={(params) => <TextField {...params} label="Select Project" size="small" />}
    sx={{ flex: 1, minWidth: 300, maxWidth: 600 }}
  />
  <RadioGroup
    row
    value={reportCompany}
    onChange={(e) => setReportCompany(e.target.value as ReportCompanyKey)}
  >
    <FormControlLabel value="IOCT" control={<Radio size="small" />} label="IOCT" />
    <FormControlLabel value="ACT" control={<Radio size="small" />} label="ACTI" />
  </RadioGroup>
</Paper>
```

- [ ] **Step 2: Remove Report Company Select from ProgressReportTab**

In `src/components/reports/ProgressReportTab.tsx`, remove the `FormControl` block for "Report as company" (lines 1020-1026). Also remove `FormControl`, `InputLabel`, `Select`, `MenuItem` from the MUI imports at the top if they are no longer used elsewhere in the file. Check: `MenuItem` and `Select` are also used for the "Load previous progress" dropdown (line 1031-1044), so keep those. Remove `InputLabel` only if the load-snapshot dropdown also gets removed (it will in Task 5). For now, keep all imports — they'll be cleaned up in later tasks.

The action buttons row (line 1019) should now start directly with the Save button:

```tsx
<Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 1.5, flexShrink: 0 }}>
  <Button variant="contained" size="small" onClick={handleSaveProgress} disabled={wbsItems.length === 0} sx={{ bgcolor: NET_PACIFIC_COLORS.primary }}>{saveFeedback ? 'Saved' : editingSnapshotIndex !== null ? 'Update snapshot' : 'Save'}</Button>
  {/* ... rest of buttons unchanged ... */}
</Box>
```

- [ ] **Step 3: Verify the app builds and renders**

Run: `CI=true npm run build`
Expected: Build succeeds with no errors.

Manually verify: navigate to `/reports/progress`, confirm the IOCT/ACTI radio buttons appear next to the project selector in the header, and that changing the selection still affects PDF export.

- [ ] **Step 4: Commit**

```bash
git add src/components/ReportsPage.tsx src/components/reports/ProgressReportTab.tsx
git commit -m "refactor(reports): move Report Company to page header as RadioGroup"
```

---

### Task 2: Wrap existing sections in MUI Accordions

This task restructures the existing JSX into 4 accordion sections without changing any logic. The goal is purely structural — move existing blocks of JSX into Accordion wrappers.

**Files:**
- Modify: `src/components/reports/ProgressReportTab.tsx` (full JSX restructure)

**Interfaces:**
- Consumes: All existing state and handlers unchanged
- Produces: 4 accordion sections wrapping existing content; accordion expand/collapse state managed by local `useState`

- [ ] **Step 1: Add MUI Accordion imports**

Add to the MUI imports at the top of `ProgressReportTab.tsx`:

```tsx
import {
  // ... existing imports ...
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
```

- [ ] **Step 2: Add accordion expansion state**

After the existing state declarations (around line 111), add:

```tsx
const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
  setup: true,
  wbs: true,
  signatories: false,
  savedReports: false,
});
const toggleSection = (section: string) => {
  setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
};
```

- [ ] **Step 3: Restructure the JSX return into 4 accordions**

Replace the entire `return (...)` block. The structure becomes:

```tsx
return (
  <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    {/* Scrollable accordion area */}
    <Box sx={{ flex: 1, overflow: 'auto', pb: 10 }}>

      {/* Accordion 1: Report Setup */}
      <Accordion
        expanded={expandedSections.setup}
        onChange={() => toggleSection('setup')}
        disableGutters
        elevation={0}
        sx={{ border: '1px solid #e2e8f0', '&:before': { display: 'none' }, mb: 1 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary, flex: 1 }}>
            Report Setup
          </Typography>
          {pbInput && preparedBy.date && (
            <Chip label="Ready" size="small" color="success" variant="outlined" sx={{ mr: 1 }} />
          )}
        </AccordionSummary>
        <AccordionDetails>
          {/* Move: progress bar + PB# + Prepared by fields (lines 901-913) */}
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
            <TextField size="small" label="PB #" placeholder="e.g. 1" value={pbInput} onChange={(e) => setPbInput(e.target.value)} sx={{ width: 80 }} />
            <TextField size="small" label="Date" type="date" value={preparedBy.date} onChange={(e) => setPreparedBy((p) => ({ ...p, date: e.target.value }))} sx={{ width: 160 }} InputLabelProps={{ shrink: true }} />
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Accordion 2: Work Breakdown Structure */}
      <Accordion
        expanded={expandedSections.wbs}
        onChange={() => toggleSection('wbs')}
        disableGutters
        elevation={0}
        sx={{ border: '1px solid #e2e8f0', '&:before': { display: 'none' }, mb: 1 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary, flex: 1 }}>
            Work Breakdown Structure
          </Typography>
          {wbsItems.length > 0 && (
            <Chip label={`${wbsItems.length} items`} size="small" variant="outlined" sx={{ mr: 1 }} />
          )}
        </AccordionSummary>
        <AccordionDetails sx={{ p: 0 }}>
          {/* Move: the entire WBS TableContainer (lines 1113-1266) + Add WBS item button (lines 1267-1269) */}
          {/* ... existing WBS table JSX unchanged ... */}
        </AccordionDetails>
      </Accordion>

      {/* Accordion 3: Signatories */}
      <Accordion
        expanded={expandedSections.signatories}
        onChange={() => toggleSection('signatories')}
        disableGutters
        elevation={0}
        sx={{ border: '1px solid #e2e8f0', '&:before': { display: 'none' }, mb: 1 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary, flex: 1 }}>
            Signatories
          </Typography>
          {(preparedBy.name || approvers.length > 0) && (
            <Chip label="Set" size="small" color="success" variant="outlined" sx={{ mr: 1 }} />
          )}
        </AccordionSummary>
        <AccordionDetails>
          {/* Move: Prepared by fields (Name, Designation, Company — NOT date, moved to Setup) */}
          {/* Move: Approvers section (lines 916-1017) */}
          {/* ... existing approver JSX unchanged ... */}
        </AccordionDetails>
      </Accordion>

      {/* Accordion 4: Saved Reports */}
      <Accordion
        expanded={expandedSections.savedReports}
        onChange={() => toggleSection('savedReports')}
        disableGutters
        elevation={0}
        sx={{ border: '1px solid #e2e8f0', '&:before': { display: 'none' }, mb: 1 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary, flex: 1 }}>
            Saved Reports
          </Typography>
          {progressSnapshots.length > 0 && (
            <Chip label={String(progressSnapshots.length)} size="small" variant="outlined" sx={{ mr: 1 }} />
          )}
        </AccordionSummary>
        <AccordionDetails>
          {/* Move: Saved reports table (lines 1046-1074) */}
          {/* Move: Editing indicator bar (lines 1075-1083) */}
          {/* ... existing snapshot table JSX unchanged ... */}
        </AccordionDetails>
      </Accordion>

    </Box>
    {/* Sticky bottom bar — Task 3 */}
  </Box>
);
```

Move each JSX block from its current location into the corresponding accordion. The blocks themselves don't change — only their parent wrappers.

**Prepared by fields split:** The `Name`, `Designation`, `Company` fields move to the Signatories accordion. The `Date` field and `PB#` field move to the Report Setup accordion. The `Date` field changes from a plain text input to `type="date"` with `InputLabelProps={{ shrink: true }}`.

Remove the old wrapper `<Paper elevation={0} sx={{ p: 2, ... }}>` — the accordions replace it.

- [ ] **Step 4: Remove unused feedback/hint blocks from the middle of the page**

The `exportFeedback` Alert (lines 1084-1089) and `showBillingHint` Alert (lines 1091-1112) currently sit between the action buttons and the WBS table. Move them above the first accordion (they're page-level feedback, not section-specific):

```tsx
<Box sx={{ flex: 1, overflow: 'auto', pb: 10 }}>
  {/* Page-level feedback */}
  {exportFeedback && (
    <Alert severity={exportFeedback.severity} onClose={() => setExportFeedback(null)} sx={{ mb: 1 }}>
      {exportFeedback.message}
    </Alert>
  )}
  {showBillingHint && (
    <Alert severity="info" onClose={() => setShowBillingHint(false)} sx={{ mb: 1 }}
      action={<Button size="small" color="inherit" onClick={() => { sessionStorage.setItem('selectedProjectId', String(project.id)); navigate('/dashboard'); }}>Go to Billing</Button>}
    >
      Progress report exported for <strong>{pbInput}</strong>. Ready to create the invoice?
    </Alert>
  )}

  {/* Accordion 1: Report Setup */}
  ...
</Box>
```

- [ ] **Step 5: Verify the app builds and renders**

Run: `CI=true npm run build`
Expected: Build succeeds.

Manually verify: navigate to `/reports/progress`, select a project. Confirm all 4 accordions render, expand/collapse works, WBS table still shows items, approver autocomplete still works, Save/Preview/Export buttons still function.

- [ ] **Step 6: Commit**

```bash
git add src/components/reports/ProgressReportTab.tsx
git commit -m "refactor(reports): restructure progress report into accordion sections"
```

---

### Task 3: Add sticky bottom action bar

Move the action buttons (Save, Preview, Export) from the middle of the page to a sticky bottom bar with a progress indicator and inline validation warnings.

**Files:**
- Modify: `src/components/reports/ProgressReportTab.tsx`

**Interfaces:**
- Consumes: `wbsOverallProgress`, `wbsItems`, `pbInput`, `handleSaveProgress`, `handlePreview`, `handleExport`, `exporting`, `saveFeedback`, `editingSnapshotIndex`
- Produces: Sticky bottom bar always visible; action buttons removed from their old location; validation warnings below buttons

- [ ] **Step 1: Compute validation warnings**

Add a `useMemo` after the existing `wbsOverallProgress` computation:

```tsx
const validationWarnings = useMemo(() => {
  const warnings: string[] = [];
  if (wbsItems.length === 0) warnings.push('No WBS items added');
  if (!pbInput.trim()) warnings.push('PB# not set');
  // Calculate total weight from top-level items
  const topLevelItems = wbsItems.filter((item) => {
    const code = (item.code || '').trim();
    if (!code) return false;
    return !wbsItems.some((other) => {
      const otherCode = (other.code || '').trim();
      if (!otherCode || otherCode === code) return false;
      return code.startsWith(otherCode + '.');
    });
  });
  const totalWeight = topLevelItems.reduce((sum, item) => {
    const code = (item.code || '').trim();
    if (isParentItem(code, wbsItems)) {
      return sum + calculateParentTotals(code, wbsItems).weight;
    }
    return sum + parseWBSNum(item.weight);
  }, 0);
  if (wbsItems.length > 0 && Math.abs(totalWeight - 100) > 0.01) {
    warnings.push(`Weight total is ${totalWeight.toFixed(1)}% — should be 100%`);
  }
  return warnings;
}, [wbsItems, pbInput, isParentItem, calculateParentTotals]);

const hasBlockingWarnings = wbsItems.length === 0;
```

- [ ] **Step 2: Add the sticky bottom bar JSX**

After the scrollable accordion area `</Box>` and before the closing `</Box>` of the return, add:

```tsx
{/* Sticky bottom bar */}
<Paper
  elevation={3}
  sx={{
    position: 'sticky',
    bottom: 0,
    zIndex: 10,
    borderTop: `2px solid ${NET_PACIFIC_COLORS.primary}`,
    px: 2,
    py: 1.5,
  }}
>
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
    {/* Left: progress bar */}
    <Box sx={{ flex: 1, minWidth: 200 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
          Overall: {wbsOverallProgress.toFixed(1)}%
        </Typography>
        {editingSnapshotIndex !== null && progressSnapshots[editingSnapshotIndex] && (
          <Chip
            label={`Editing PB${progressSnapshots[editingSnapshotIndex].pbNumber}`}
            size="small"
            color="info"
            variant="outlined"
          />
        )}
      </Box>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, wbsOverallProgress)}
        sx={{
          height: 8,
          borderRadius: 4,
          bgcolor: 'grey.200',
          '& .MuiLinearProgress-bar': {
            borderRadius: 4,
            bgcolor: wbsOverallProgress >= 100 ? 'success.main' : NET_PACIFIC_COLORS.primary,
          },
        }}
      />
    </Box>
    {/* Right: action buttons */}
    <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
      <Button
        variant="outlined"
        size="small"
        onClick={handleSaveProgress}
        disabled={wbsItems.length === 0}
        sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
      >
        {saveFeedback ? 'Saved' : 'Save'}
      </Button>
      <Button
        variant="outlined"
        size="small"
        startIcon={<VisibilityIcon />}
        onClick={handlePreview}
        disabled={hasBlockingWarnings}
        sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
      >
        Preview
      </Button>
      <Button
        variant="contained"
        size="small"
        startIcon={<PictureAsPdfIcon />}
        onClick={handleExport}
        disabled={hasBlockingWarnings || exporting}
        sx={{ bgcolor: NET_PACIFIC_COLORS.primary }}
      >
        {exporting ? 'Uploading...' : 'Export PDF'}
      </Button>
    </Box>
  </Box>
  {/* Validation warnings */}
  {validationWarnings.length > 0 && (
    <Box sx={{ mt: 1 }}>
      {validationWarnings.map((w) => (
        <Alert key={w} severity="warning" sx={{ py: 0, px: 1, mb: 0.5, '& .MuiAlert-message': { fontSize: '0.75rem' } }}>
          {w}
        </Alert>
      ))}
    </Box>
  )}
</Paper>
```

- [ ] **Step 3: Remove old action buttons and progress bar from their previous locations**

Remove the old action buttons `Box` that previously contained Save, Preview, Export, and Load Previous Progress (the block around lines 1019-1044 in the original file). Also remove the old progress bar from the header section (lines 901-906) since it's now in the sticky bar.

The "Load previous progress" dropdown is no longer needed here — it's replaced by the Saved Reports accordion table (Task 2 already moved it). Remove the dropdown entirely.

- [ ] **Step 4: Verify the app builds and renders**

Run: `CI=true npm run build`
Expected: Build succeeds.

Manually verify: the sticky bar appears at the bottom, shows progress, buttons work, validation warnings appear when WBS is empty or PB# is not set.

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/ProgressReportTab.tsx
git commit -m "feat(reports): add sticky bottom action bar with validation warnings"
```

---

### Task 4: Add WBS templates

Add a template selector dropdown to the WBS accordion that pre-fills the WBS table with industry-standard structures.

**Files:**
- Modify: `src/components/reports/ProgressReportTab.tsx`

**Interfaces:**
- Consumes: `wbsItems`, `setWbsItems`, `saveWBS`, `syncProjectStatusFromWBS`, `project.id`
- Produces: `WBS_TEMPLATES` constant; template selector in WBS accordion header; confirmation dialog when replacing existing items

- [ ] **Step 1: Add the WBS_TEMPLATES constant**

Add after the existing constants (around line 59), before the component:

```tsx
const WBS_TEMPLATES: Record<string, { label: string; items: { code: string; name: string }[] }> = {
  automation: {
    label: 'Automation Project',
    items: [
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
  },
  construction: {
    label: 'Construction Project',
    items: [
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
  },
  service: {
    label: 'Service Contract',
    items: [
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
  },
};
```

- [ ] **Step 2: Add template application handler**

Add after `handleDeleteSnapshot`:

```tsx
const handleApplyTemplate = (templateKey: string) => {
  const template = WBS_TEMPLATES[templateKey];
  if (!template) return;
  if (wbsItems.length > 0) {
    if (!window.confirm('Replace current WBS with template? This cannot be undone.')) return;
  }
  const newItems: WBSItem[] = template.items.map((t, i) => ({
    id: `wbs-${Date.now()}-${i}`,
    code: t.code,
    name: t.name,
    weight: 0,
    progress: 0,
  }));
  setWbsItems(newItems);
  saveWBS(project.id, newItems);
  syncProjectStatusFromWBS(newItems);
};
```

- [ ] **Step 3: Add template selector to WBS accordion**

Inside the WBS accordion's `AccordionDetails`, above the existing `TableContainer`, add:

```tsx
<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, flexWrap: 'wrap' }}>
  <FormControl size="small" sx={{ minWidth: 200 }}>
    <InputLabel id="wbs-template-label">Template</InputLabel>
    <Select
      labelId="wbs-template-label"
      value=""
      label="Template"
      onChange={(e) => {
        if (e.target.value) handleApplyTemplate(e.target.value as string);
      }}
      displayEmpty
    >
      <MenuItem value="" disabled><em>Load a template...</em></MenuItem>
      {Object.entries(WBS_TEMPLATES).map(([key, tpl]) => (
        <MenuItem key={key} value={key}>{tpl.label} ({tpl.items.length} items)</MenuItem>
      ))}
    </Select>
  </FormControl>
  <Button
    startIcon={<AddIcon />}
    onClick={handleAddWBSItem}
    sx={{ textTransform: 'none', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}
  >
    Add WBS item
  </Button>
</Box>
```

Remove the old "Add WBS item" button from below the table (lines 1267-1269) since it's now inside the accordion header area.

- [ ] **Step 4: Verify the app builds and renders**

Run: `CI=true npm run build`
Expected: Build succeeds.

Manually verify: select a template, confirm WBS table populates. Select another template with existing items, confirm the confirmation dialog appears. Cancel — items unchanged. Confirm — items replaced.

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/ProgressReportTab.tsx
git commit -m "feat(reports): add WBS templates (automation, construction, service)"
```

---

### Task 5: Refactor signatories into contact cards

Replace the grid of individual text fields for Prepared By and Approved By with compact contact cards that expand to edit.

**Files:**
- Modify: `src/components/reports/ProgressReportTab.tsx`

**Interfaces:**
- Consumes: `preparedBy`, `setPreparedBy`, `approvers`, `setApprovers`, `clientContacts`, `currentUser`, `reportCompany`
- Produces: Contact card components inline; prepared-by auto-populated from logged-in user; approver cards with expand-to-edit

- [ ] **Step 1: Add state for card editing**

Add after the accordion expansion state:

```tsx
const [editingPreparedBy, setEditingPreparedBy] = useState(false);
const [editingApproverIndex, setEditingApproverIndex] = useState<number | null>(null);
```

- [ ] **Step 2: Build the Prepared By contact card**

Replace the old Prepared By text fields in the Signatories accordion with:

```tsx
<Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
  Prepared by
</Typography>
{!editingPreparedBy ? (
  <Paper variant="outlined" sx={{ p: 1.5, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{preparedBy.name || '(not set)'}</Typography>
      {(preparedBy.designation || preparedBy.company) && (
        <Typography variant="caption" color="text.secondary">
          {[preparedBy.designation, preparedBy.company].filter(Boolean).join(' · ')}
        </Typography>
      )}
    </Box>
    <Button size="small" onClick={() => setEditingPreparedBy(true)} sx={{ textTransform: 'none', color: NET_PACIFIC_COLORS.primary }}>
      Edit
    </Button>
  </Paper>
) : (
  <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
      <TextField size="small" label="Name" value={preparedBy.name} onChange={(e) => setPreparedBy(p => ({ ...p, name: e.target.value }))} sx={{ flex: 1, minWidth: 150 }} />
      <TextField size="small" label="Designation" value={preparedBy.designation} onChange={(e) => setPreparedBy(p => ({ ...p, designation: e.target.value }))} sx={{ flex: 1, minWidth: 120 }} />
      <TextField size="small" label="Company" value={preparedBy.company} onChange={(e) => setPreparedBy(p => ({ ...p, company: e.target.value }))} sx={{ flex: 1, minWidth: 120 }} />
    </Box>
    <Button size="small" onClick={() => setEditingPreparedBy(false)} sx={{ textTransform: 'none' }}>Done</Button>
  </Paper>
)}
```

- [ ] **Step 3: Build the Approved By contact cards**

Replace the old approver rows with cards:

```tsx
<Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
  Approved by
</Typography>
{approvers.map((approver, index) => (
  <Paper key={index} variant="outlined" sx={{ p: 1.5, mb: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
    {editingApproverIndex === index ? (
      <Box sx={{ flex: 1 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
          <TextField size="small" label="Name" value={approver.name} onChange={(e) => { const updated = [...approvers]; updated[index] = { ...updated[index], name: e.target.value }; setApprovers(updated); }} sx={{ flex: 1, minWidth: 150 }} />
          <TextField size="small" label="Designation" value={approver.designation} onChange={(e) => { const updated = [...approvers]; updated[index] = { ...updated[index], designation: e.target.value }; setApprovers(updated); }} sx={{ flex: 1, minWidth: 120 }} />
          <TextField size="small" label="Company" value={approver.company} onChange={(e) => { const updated = [...approvers]; updated[index] = { ...updated[index], company: e.target.value }; setApprovers(updated); }} sx={{ flex: 1, minWidth: 120 }} />
        </Box>
        <Button size="small" onClick={() => setEditingApproverIndex(null)} sx={{ textTransform: 'none' }}>Done</Button>
      </Box>
    ) : (
      <>
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{approver.name || '(not set)'}</Typography>
          {(approver.designation || approver.company) && (
            <Typography variant="caption" color="text.secondary">
              {[approver.designation, approver.company].filter(Boolean).join(' · ')}
            </Typography>
          )}
        </Box>
        <Box>
          <Button size="small" onClick={() => setEditingApproverIndex(index)} sx={{ textTransform: 'none', color: NET_PACIFIC_COLORS.primary, minWidth: 0 }}>
            Edit
          </Button>
          <IconButton size="small" onClick={() => setApprovers(prev => prev.filter((_, i) => i !== index))} color="error" title="Remove">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      </>
    )}
  </Paper>
))}
{approvers.length === 0 && (
  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mb: 1 }}>
    No approvers added yet.
  </Typography>
)}
{approvers.length < 3 && (
  <Autocomplete
    freeSolo
    size="small"
    options={clientContacts}
    getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt.name)}
    isOptionEqualToValue={(opt, val) => opt.name === (typeof val === 'string' ? val : val.name)}
    inputValue=""
    onInputChange={() => {}}
    onChange={(_, newVal) => {
      if (newVal && typeof newVal !== 'string') {
        setApprovers(prev => [...prev, { name: newVal.name, designation: newVal.designation, company: newVal.company }]);
      } else if (typeof newVal === 'string' && newVal.trim()) {
        setApprovers(prev => [...prev, { name: newVal.trim(), designation: '', company: '' }]);
      }
    }}
    renderOption={(props, opt) => (
      <li {...props} key={opt.name + opt.designation}>
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>{opt.name}</Typography>
          {(opt.designation || opt.company) && (
            <Typography variant="caption" color="text.secondary">
              {[opt.designation, opt.company].filter(Boolean).join(' · ')}
            </Typography>
          )}
        </Box>
      </li>
    )}
    renderInput={(params) => (
      <TextField {...params} label="Add approver" size="small" placeholder={clientContacts.length > 0 ? 'Search client contacts...' : 'Type a name'} />
    )}
    sx={{ maxWidth: 400 }}
    noOptionsText="No client contacts found"
  />
)}
```

- [ ] **Step 4: Verify the app builds and renders**

Run: `CI=true npm run build`
Expected: Build succeeds.

Manually verify: Prepared By shows as a card with Edit/Done toggle. Approvers show as cards with Edit/Delete. Adding via autocomplete creates a card. Editing expands into text fields.

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/ProgressReportTab.tsx
git commit -m "refactor(reports): replace signatory text fields with contact cards"
```

---

### Task 6: Simplify saved reports section (remove mode-switching)

Replace the snapshot dropdown + edit-mode pattern with a simple table in the Saved Reports accordion. Eliminate the confusing "Update snapshot" / "Cancel edit" mode-switch.

**Files:**
- Modify: `src/components/reports/ProgressReportTab.tsx`

**Interfaces:**
- Consumes: `progressSnapshots`, `editingSnapshotIndex`, `handleLoadSnapshot`, `handleDeleteSnapshot`, `handleSaveProgress`
- Produces: Clean table UI in Saved Reports accordion; "Editing PBx" chip in sticky bar (already done in Task 3); simplified save logic

- [ ] **Step 1: Simplify the save button logic**

The Save button in the sticky bar (Task 3) currently shows "Update snapshot" when editing. Change it to always show "Save" — the save handler already checks `editingSnapshotIndex` internally to decide whether to create or update:

In the sticky bar (from Task 3), change the Save button label:

```tsx
<Button
  variant="outlined"
  size="small"
  onClick={handleSaveProgress}
  disabled={wbsItems.length === 0}
  sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
>
  {saveFeedback ? 'Saved' : 'Save'}
</Button>
```

This is already what Task 3 specified — verify it doesn't still have the old conditional label.

- [ ] **Step 2: Update the Saved Reports accordion content**

Replace the content of the Saved Reports accordion with a clean table that has Load and Delete as direct actions — no dropdown, no separate edit mode indicator:

```tsx
<AccordionDetails>
  {progressSnapshots.length === 0 ? (
    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', py: 2, textAlign: 'center' }}>
      No saved reports yet. Fill in the WBS above and click Save to create your first report.
    </Typography>
  ) : (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem' }}>PB#</TableCell>
            <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem' }}>Date</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8125rem' }}>Progress</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8125rem' }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {progressSnapshots.map((s, idx) => (
            <TableRow key={`${s.date}-${s.pbNumber}-${idx}`} hover selected={editingSnapshotIndex === idx}>
              <TableCell>PB{s.pbNumber}</TableCell>
              <TableCell>{new Date(s.date).toLocaleDateString('en-US', { dateStyle: 'medium' })}</TableCell>
              <TableCell align="right">{Math.round(s.overallProgress * 100) / 100}%</TableCell>
              <TableCell align="right">
                <Button size="small" onClick={() => handleLoadSnapshot(s, idx)} sx={{ color: NET_PACIFIC_COLORS.primary, textTransform: 'none' }}>
                  Load
                </Button>
                <IconButton size="small" color="error" onClick={() => handleDeleteSnapshot(idx)} title="Delete">
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )}
</AccordionDetails>
```

- [ ] **Step 3: Remove old editing indicator and Cancel/Delete buttons**

Remove the old editing snapshot info bar (previously lines 1075-1083) that showed "Editing: ... Click 'Update snapshot' to save." + "Cancel edit" + "Delete snapshot" buttons. The edit state is now communicated via the "Editing PBx" chip in the sticky bar and the selected row highlight in the table.

Also remove `handleDeleteLoadedSnapshot` — it's no longer needed since delete is always available per-row in the table. The `handleDeleteSnapshot` already handles clearing `editingSnapshotIndex` when the currently-editing snapshot is deleted.

- [ ] **Step 4: Remove the old "Load previous progress" dropdown**

If not already removed in Task 3, delete the `FormControl` with the "Load previous progress" `Select` dropdown. The Saved Reports table is the only way to load now.

Remove `FormControl` and `InputLabel` from the MUI imports if no longer used elsewhere in the file. Check: the template selector in Task 4 uses `FormControl`, `InputLabel`, `Select`, `MenuItem` — keep those.

- [ ] **Step 5: Verify the app builds and renders**

Run: `CI=true npm run build`
Expected: Build succeeds.

Manually verify: Saved Reports accordion shows the table. Load fills WBS. Save creates/updates correctly. Chip in sticky bar appears when editing. No old mode-switch UI remains.

- [ ] **Step 6: Commit**

```bash
git add src/components/reports/ProgressReportTab.tsx
git commit -m "refactor(reports): simplify saved reports to table with no mode-switching"
```

---

### Task 7: Auto-suggest PB# and cleanup

Add PB# auto-suggestion based on existing saved reports, clean up unused imports, and do a final type-check.

**Files:**
- Modify: `src/components/reports/ProgressReportTab.tsx`

**Interfaces:**
- Consumes: `progressSnapshots`, `pbInput`, `setPbInput`
- Produces: PB# auto-populated on mount when empty; clean import list

- [ ] **Step 1: Add PB# auto-suggestion**

Add a `useEffect` after the existing `initialPb` sync effect (around line 132):

```tsx
// Auto-suggest next PB# based on saved reports
useEffect(() => {
  if (pbInput || initialPb) return; // don't override user input or initialPb
  if (progressSnapshots.length === 0) return;
  const maxPb = progressSnapshots.reduce((max, s) => {
    const num = parseInt(s.pbNumber, 10);
    return !isNaN(num) && num > max ? num : max;
  }, 0);
  if (maxPb > 0) {
    setPbInput(String(maxPb + 1));
  }
}, [progressSnapshots, initialPb]); // eslint-disable-line react-hooks/exhaustive-deps
```

Note the suppressed exhaustive-deps: `pbInput` is intentionally excluded so typing in the field doesn't re-trigger the suggestion.

- [ ] **Step 2: Clean up unused imports**

Review all MUI imports at the top and remove any that are no longer used after the refactor. The following are likely candidates for removal:

- Keep: `Accordion`, `AccordionSummary`, `AccordionDetails`, `Chip`, `Alert`, `Autocomplete`, `Box`, `Paper`, `Typography`, `Button`, `TextField`, `Table`, `TableBody`, `TableCell`, `TableContainer`, `TableHead`, `TableRow`, `TableFooter`, `LinearProgress`, `IconButton`, `FormControl`, `InputLabel`, `Select`, `MenuItem`, `RadioGroup` (if used), `FormControlLabel` (if used)
- Remove if unused: check each import against actual usage in the file

Also check icon imports — remove any unused icons.

- [ ] **Step 3: Final type-check and build**

Run: `npx tsc --noEmit`
Expected: No type errors.

Run: `CI=true npm run build`
Expected: Build succeeds with no warnings treated as errors.

- [ ] **Step 4: Full manual verification**

Test the complete flow:
1. Navigate to `/reports/progress`
2. Select a project
3. Verify IOCT/ACTI radio in the header works
4. Expand Report Setup — PB# auto-suggests, date picker works
5. Expand WBS — select Automation template, items populate
6. Edit weights and progress values
7. Collapse WBS, expand Signatories — prepared-by card shows, edit works
8. Add an approver via autocomplete — card appears
9. Click Save in sticky bar — Saved Reports accordion shows the entry
10. Click Export PDF — PDF generates correctly with all data
11. Load a saved report — WBS replaces, "Editing PBx" chip appears in sticky bar
12. Save again — updates the loaded report

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/ProgressReportTab.tsx
git commit -m "feat(reports): auto-suggest PB# and cleanup imports"
```
