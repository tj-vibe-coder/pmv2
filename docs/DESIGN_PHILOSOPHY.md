# pmv2 — UI Design Philosophy

> **MANDATORY FOR ALL AGENTS AND DEVELOPERS**
>
> Before creating or significantly modifying any page/component in this project, read this document in full.
> New pages that deviate from these patterns will be rejected and asked to be redesigned.
> The reference implementation is `src/components/Dashboard.tsx`.

---

## 1. The Design System at a Glance

The app uses **Material-UI v7** with a custom blue-toned corporate palette called `NET_PACIFIC_COLORS`.
Every page that contains a list, table, or financial summary follows the same structural template:

```
Box (root — full height)
  ├── Box (title row)
  │     └── Typography h4
  ├── Grid container (KPI cards)
  ├── Paper (filters)
  └── Paper (table / main content)
        ├── Box (table header bar — title + primary action button)
        └── TableContainer → Table (stickyHeader, size="small")
```

---

## 2. Color Palette — `NET_PACIFIC_COLORS`

Copy this constant into every new page that needs colors. Do **not** invent new colors.

```tsx
const NET_PACIFIC_COLORS = {
  primary:   '#2c5aa0',
  secondary: '#1e4a72',
  accent1:   '#4f7bc8',
  accent2:   '#3c6ba5',
  success:   '#00b894',
  warning:   '#fdcb6e',
  error:     '#e84393',
  info:      '#74b9ff',
};
```

---

## 3. Page Root

Every page component must use this as its outermost wrapper — **not** `Container`, **not** `Box p:2 maxWidth:1400`.

```tsx
<Box sx={{ height: '100%', overflow: 'hidden' }}>
  ...
</Box>
```

---

## 4. Page Title

Use `h4` + `fontWeight: 600`. No subtitle text below the title (keep it clean).
The "Add" / primary action button goes inside the table header bar (Section 7), not here.

```tsx
<Box sx={{ mb: 1.5 }}>
  <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
    Page Title
  </Typography>
</Box>
```

---

## 5. KPI / Summary Cards

Use gradient `Card` components — **not** plain `Paper` with borders.
Always use `Grid container spacing={1.5}` with `size={{ xs: 6, sm: 3 }}` (4 across on md+).
`CardContent` uses `p: 2`.

```tsx
<Grid container spacing={1.5} sx={{ mb: 2 }}>
  {/* Blue — primary metric */}
  <Grid size={{ xs: 6, sm: 3 }}>
    <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`, color: 'white' }}>
      <CardContent sx={{ p: 2 }}>
        <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Label</Typography>
        <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
          {value}
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.8 }}>sub-label</Typography>
      </CardContent>
    </Card>
  </Grid>

  {/* Green — positive/collected metric */}
  <Grid size={{ xs: 6, sm: 3 }}>
    <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.success} 0%, #55efc4 100%)`, color: 'white' }}>
      ...
    </Card>
  </Grid>

  {/* Blue-purple — neutral/info metric */}
  <Grid size={{ xs: 6, sm: 3 }}>
    <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, #a29bfe 100%)`, color: 'white' }}>
      ...
    </Card>
  </Grid>

  {/* Yellow — warning metric (use dark text #2d3436 here, not white) */}
  <Grid size={{ xs: 6, sm: 3 }}>
    <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.warning} 0%, #ffeaa7 100%)`, color: '#2d3436' }}>
      ...
    </Card>
  </Grid>

  {/* Red — alert/overdue metric (conditional: only when count > 0) */}
  {/* Use: background: 'linear-gradient(135deg, #e53935 0%, #ef9a9a 100%)', color: 'white' */}
</Grid>
```

### Standard gradient palette

| Slot | Use case | Gradient |
|---|---|---|
| Blue | Primary / total count | `#2c5aa0 → #4f7bc8` |
| Green | Positive / collected / healthy | `#00b894 → #55efc4` |
| Blue-purple | Neutral / informational | `#74b9ff → #a29bfe` |
| Yellow | Warning / pending (dark text) | `#fdcb6e → #ffeaa7` |
| Red | Overdue / error / over-budget | `#e53935 → #ef9a9a` |

---

## 6. Filter Bar

```tsx
<Paper sx={{ p: 1.5, mb: 1.5, borderRadius: 2 }}>
  <Grid container spacing={1.5}>
    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
      <TextField fullWidth label="Search" size="small" />
    </Grid>
    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
      <FormControl fullWidth size="small">
        <InputLabel>Status</InputLabel>
        <Select label="Status" value={filter} onChange={...}>
          <MenuItem value="">All</MenuItem>
          ...
        </Select>
      </FormControl>
    </Grid>
  </Grid>
</Paper>
```

Rules:
- Use `Select` + `MenuItem` dropdowns, **not** `Chip` filter buttons
- All inputs use `size="small"`
- Paper padding: `p: 1.5` (not `p: 2` or `p: 3`)

---

## 7. Table — Main Content Area

### 7a. Outer Paper

```tsx
<Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2, flexGrow: 1 }}>
```

### 7b. Table Header Bar (title + primary action button)

The primary action button lives here — **not** in the page title row.

```tsx
<Box sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e0e0e0' }}>
  <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
    Items ({count})
  </Typography>
  <Button
    variant="contained"
    size="small"
    startIcon={<AddIcon />}
    onClick={openAdd}
    sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
  >
    Add Item
  </Button>
</Box>
```

### 7c. TableContainer + Table

```tsx
<TableContainer sx={{ maxHeight: 'calc(100vh - 480px)', minHeight: 300 }}>
  <Table stickyHeader size="small">
```

- Always `stickyHeader` + `size="small"`
- `maxHeight: calc(100vh - 480px)` keeps the table scrollable without the page itself scrolling

### 7d. Table Header Cells

```tsx
<TableCell sx={{ fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
  Column Name
</TableCell>
```

- `fontWeight: 600`, `fontSize: '0.875rem'` on **every** header cell
- Add `whiteSpace: 'nowrap'` for columns that must not wrap

### 7e. Table Body Rows

```tsx
<TableRow hover sx={{ '&:nth-of-type(odd)': { backgroundColor: 'rgba(0,0,0,0.02)' } }}>
  <TableCell sx={{ fontSize: '0.8rem' }}>...</TableCell>
</TableRow>
```

- Always `hover`
- Alternating rows via `nth-of-type(odd)` at `rgba(0,0,0,0.02)` — **not** manual `idx % 2`
- Body cell text: `fontSize: '0.8rem'`

### 7f. Summary / Total Row (when needed)

```tsx
<TableRow sx={{ backgroundColor: NET_PACIFIC_COLORS.primary }}>
  <TableCell sx={{ color: 'white', fontWeight: 700, fontSize: '0.8rem' }}>TOTAL</TableCell>
  ...
</TableRow>
```

---

## 8. Non-Table Content Papers (Charts, Breakdowns, Details)

```tsx
<Paper sx={{
  borderRadius: 2,
  overflow: 'hidden',
  background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
  border: '1px solid #e2e8f0',
}}>
  <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0' }}>
    <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
      Section Title
    </Typography>
  </Box>
  {/* content */}
</Paper>
```

Section title color is always `NET_PACIFIC_COLORS.primary` (`#2c5aa0`).

---

## 9. Grid — MUI v7 API

Always use the MUI v7 `Grid` (imported from `@mui/material`).
**Never** use `GridLegacy` or the old `Grid item xs={}` API.

```tsx
// CORRECT
import { Grid } from '@mui/material';
<Grid container spacing={1.5}>
  <Grid size={{ xs: 12, sm: 6, md: 3 }}>

// WRONG — do not use
import Grid from '@mui/material/GridLegacy';
<Grid container spacing={2}>
  <Grid item xs={12} sm={6}>
```

---

## 10. Buttons

| Use case | Style |
|---|---|
| Primary action (Add, Save) | `variant="contained"` + `sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}` |
| Secondary / outlined | `variant="outlined"` + `sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}` |
| Destructive (Delete) | `variant="contained" color="error"` |
| Cancel / neutral | `variant="text"` (no sx color override needed) |

Always `size="small"` for buttons inside table header bars.

---

## 11. Dialogs

```tsx
<Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
  <DialogTitle sx={{ fontWeight: 600 }}>Dialog Title</DialogTitle>
  <DialogContent>
    <Stack spacing={2} sx={{ mt: 1 }}>
      {error && <Alert severity="error">{error}</Alert>}
      {/* fields */}
    </Stack>
  </DialogContent>
  <DialogActions sx={{ px: 3, pb: 2 }}>
    <Button onClick={onClose}>Cancel</Button>
    <Button variant="contained" onClick={onSave}
      sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}>
      Save
    </Button>
  </DialogActions>
</Dialog>
```

- Dialog title `fontWeight: 600` (not 700)
- Error alert always at the top of `DialogContent`
- `DialogActions` padding: `px: 3, pb: 2`

---

## 12. Typography Conventions

| Use | Variant | Weight | Color |
|---|---|---|---|
| Page title | `h4` | `600` | default |
| Table / Paper section title | `h6` | `600` | `NET_PACIFIC_COLORS.primary` |
| KPI card label | `body2` | default | white, `opacity: 0.9` |
| KPI card value | `h5` | `700` | white |
| KPI card sub-label | `caption` | default | white, `opacity: 0.8` |
| Table header cells | — | `600` | default (MUI `fontWeight`) |
| Table body cells | — | default | `fontSize: '0.8rem'` |

---

## 13. Spacing Conventions

| Context | Value |
|---|---|
| `Grid container spacing` | `1.5` |
| `Paper` padding (filters, header) | `1.5` |
| `CardContent` padding | `2` |
| `Box mb` below title | `1.5` |
| `Grid mb` after KPI cards | `2` |

---

## 14. Reference Implementations

Study these files before building a new page — in order of completeness:

1. **`src/components/Dashboard.tsx`** — canonical reference. KPI cards, filters, table, export menu, charts.
2. **`src/components/CollectionsDashboard.tsx`** — clean, recent example. KPI cards + filter bar + table + dialogs.
3. **`src/components/InvestmentTrackerPage.tsx`** — three-card layout + ledger table + breakdown sub-table.

---

## 15. What NOT to Do

- Do not use `Container` as the page root
- Do not use `maxWidth` or `mx: auto` on the page root Box
- Do not put the primary "Add" button in the page title row — it belongs in the table header bar
- Do not use plain white `Paper` with `border: '1px solid #e0e0e0'` for KPI/summary cards — use gradient `Card`
- Do not use `Chip` components for filter status — use `Select` dropdowns
- Do not hardcode alternating row backgrounds with `idx % 2` — use `nth-of-type(odd)` CSS
- Do not use `GridLegacy` or `Grid item xs={}` — use `Grid size={{ ... }}`
- Do not use `h5` for page titles — use `h4`
- Do not hardcode colors like `#1a3f72` or `#1565c0` — use `NET_PACIFIC_COLORS`
- Do not set `fontWeight: 700` on dialog titles — use `600`
