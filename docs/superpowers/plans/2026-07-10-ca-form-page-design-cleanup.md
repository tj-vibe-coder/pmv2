# CA Form Page Design-System Retrofit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `src/components/CAFormPage.tsx` in line with `docs/DESIGN_PHILOSOPHY.md` — visual/structural only, zero behavior change.

**Architecture:** Single-file retrofit. Replace the ad-hoc `theme` const with the canonical `NET_PACIFIC_COLORS`, fix the root/title, convert the employee balance summary to gradient KPI cards (admin keeps a restyled table), adopt the §8 gradient-header Paper pattern for the form and CA-list sections, apply standard table typography/striping, and polish the three dialogs.

**Tech Stack:** React 19 + TypeScript, MUI v7. CRA — verify with `npx tsc --noEmit`; browser verification uses the repo-local `verify` skill (client on 3000 via preview tools, mock express API on 3001 — this machine has no Firestore creds).

**Spec:** `docs/superpowers/specs/2026-07-10-ca-form-page-design-cleanup-design.md`

## Global Constraints

- Only `src/components/CAFormPage.tsx` changes (plus this plan/spec in docs). No behavior, data, endpoint, PDF, or scan-flow changes.
- No unit-test harness exists for UI in this repo — the test cycle per task is `npx tsc --noEmit` + the Task 5 browser walkthrough.
- Line numbers below are against the file as of commit `e7f79ed`; re-locate by the quoted code, not the number, if drift occurs.
- Commits use `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`; push after the final task (user pushes per-feature in this workflow).
- One deliberate deviation from DESIGN_PHILOSOPHY §7e, agreed in the spec's self-review: the CA list renders each CA as a **pair** of `<TableRow>`s (main + collapse), so plain `nth-of-type(odd)` would tint every main row identically instead of alternating. Use `nth-of-type(4n+1)` on the TableBody instead (stripes every other main row, leaves collapse rows alone).

---

### Task 1: Foundation — canonical colors, imports, root, title

**Files:**
- Modify: `src/components/CAFormPage.tsx` (imports ~line 2–34, `const theme` at 818, root/title at 820–827)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: module-level `NET_PACIFIC_COLORS` const and `Card`/`CardContent`/`Grid` imports that Tasks 2–3 reference.

- [ ] **Step 1: Add MUI imports**

In the existing `@mui/material` import block (which already has `Box, Typography, Paper, …`), add three names:

```tsx
  Card,
  CardContent,
  Grid,
```

- [ ] **Step 2: Add the canonical color constant**

Immediately after the `CA_CATEGORIES` const (line ~48), insert:

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

- [ ] **Step 3: Remove the ad-hoc theme const and repoint all references**

Delete this line (~818):

```tsx
  const theme = { primary: '#2c5aa0', secondary: '#1e4a72' };
```

Then replace **all** occurrences (29 refs) in the file:
- `theme.primary` → `NET_PACIFIC_COLORS.primary`
- `theme.secondary` → `NET_PACIFIC_COLORS.secondary`

(The `+ '08'` / `+ '12'` hex-alpha concatenations keep working — same hex value. Those rows get further restyled in Tasks 2–3.)

- [ ] **Step 4: Fix root and title**

Replace (~820–827):

```tsx
  return (
    <Box sx={{ p: 3, width: '100%' }}>
      <Typography variant="h5" sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary, mb: 2 }}>
        Cash Advance (CA) Form
      </Typography>
```

with:

```tsx
  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: 3 }}>
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Cash Advance (CA) Form
        </Typography>
      </Box>
```

Keep the `body2` explainer paragraph below the title unchanged (the spec keeps it — this page is a form, not a dashboard).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit` — expected: no output. (Watch for a leftover `theme.` reference — grep to confirm zero: `grep -n "theme\." src/components/CAFormPage.tsx`.)

- [ ] **Step 6: Commit**

```bash
git add src/components/CAFormPage.tsx
git commit -m "refactor(ca-form): canonical NET_PACIFIC_COLORS, h4 title, standard page root

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Balance summary — KPI cards for employees, restyled table for admins

**Files:**
- Modify: `src/components/CAFormPage.tsx` (the `!loading && visibleEmployeeBalances.length > 0` block, ~1039–1087 pre-Task-1)

**Interfaces:**
- Consumes: `NET_PACIFIC_COLORS`, `Card`, `CardContent`, `Grid` from Task 1; existing `visibleEmployeeBalances`, `totalOutstandingHeld`, `totalCompanyOwes`, `isAdmin` (unchanged).
- Produces: nothing downstream.

- [ ] **Step 1: Replace the balance block**

Replace the entire `{!loading && visibleEmployeeBalances.length > 0 && ( <Paper …>…</Paper> )}` block with a branch — employee (non-admin, always exactly their own single row) gets 4 gradient KPI cards; admin keeps the multi-row table inside a §8-pattern Paper:

```tsx
      {!loading && visibleEmployeeBalances.length > 0 && (
        isAdmin ? (
          <Paper sx={{ mb: 3, borderRadius: 2, overflow: 'hidden', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #e2e8f0' }}>
            <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0' }}>
              <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
                Cash Advance Balances by Employee
              </Typography>
            </Box>
            <Box sx={{ p: 1.5 }}>
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 1.5 }}>
                <Typography variant="body2">
                  Held by employees (still to liquidate):{' '}
                  <strong>{totalOutstandingHeld.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                </Typography>
                {totalCompanyOwes > 0 && (
                  <Typography variant="body2" sx={{ color: 'error.main' }}>
                    Company owes employees (over-liquidated):{' '}
                    <strong>{totalCompanyOwes.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                  </Typography>
                )}
              </Box>
              <TableContainer>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Employee</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }} align="right">Approved CAs</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }} align="right">Total Approved</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }} align="right">Holds Unliquidated</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }} align="right">Company Owes</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visibleEmployeeBalances.map((b) => (
                      <TableRow key={b.userId} hover sx={{ '&:nth-of-type(odd)': { backgroundColor: 'rgba(0,0,0,0.02)' } }}>
                        <TableCell sx={{ fontSize: '0.8rem' }}>{b.name}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }} align="right">{b.approvedCount}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }} align="right">{b.totalApproved.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: b.heldPositive > 0 ? 600 : undefined, color: b.heldPositive > 0 ? 'warning.main' : 'text.disabled' }}>
                          {b.heldPositive > 0 ? b.heldPositive.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: b.owedNegative > 0 ? 600 : undefined, color: b.owedNegative > 0 ? 'error.main' : 'text.disabled' }}>
                          {b.owedNegative > 0 ? b.owedNegative.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Paper>
        ) : (
          <Grid container spacing={1.5} sx={{ mb: 2 }}>
            {(() => {
              const b = visibleEmployeeBalances[0];
              const fmt = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2 });
              return (
                <>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Card sx={{ height: '100%', background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`, color: 'white' }}>
                      <CardContent sx={{ p: 2 }}>
                        <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Approved CAs</Typography>
                        <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{b.approvedCount}</Typography>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>with open balance</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Card sx={{ height: '100%', background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, #a29bfe 100%)`, color: 'white' }}>
                      <CardContent sx={{ p: 2 }}>
                        <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Total Approved</Typography>
                        <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{fmt(b.totalApproved)}</Typography>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>sum of approved CAs</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Card sx={{ height: '100%', background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.warning} 0%, #ffeaa7 100%)`, color: '#2d3436' }}>
                      <CardContent sx={{ p: 2 }}>
                        <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Holds Unliquidated</Typography>
                        <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{b.heldPositive > 0 ? fmt(b.heldPositive) : '—'}</Typography>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>still to liquidate</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Card sx={{ height: '100%', background: b.owedNegative > 0 ? 'linear-gradient(135deg, #e53935 0%, #ef9a9a 100%)' : `linear-gradient(135deg, ${NET_PACIFIC_COLORS.success} 0%, #55efc4 100%)`, color: 'white' }}>
                      <CardContent sx={{ p: 2 }}>
                        <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Company Owes</Typography>
                        <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{b.owedNegative > 0 ? fmt(b.owedNegative) : '—'}</Typography>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>over-liquidated</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </>
              );
            })()}
          </Grid>
        )
      )}
```

Notes: the non-admin branch is safe to index `[0]` — `visibleEmployeeBalances` is filtered to the current user's id so it has exactly one row when non-empty, and the surrounding `length > 0` guard already ran. Values/formatting are identical to the old table (same `—` placeholders).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` — expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/CAFormPage.tsx
git commit -m "feat(ca-form): gradient KPI cards for employee CA balance summary

Admins keep the per-employee table (KPI cards don't fit multi-row data),
restyled to the standard header/body typography inside a gradient-header
Paper per DESIGN_PHILOSOPHY.md §8.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Section Papers + table styling (request form, breakdown table, CA list)

**Files:**
- Modify: `src/components/CAFormPage.tsx` (form Paper ~835, breakdown table header ~937–942, CA-list title + TableContainer ~1089–1119, TableBody ~1120)

**Interfaces:**
- Consumes: `NET_PACIFIC_COLORS` from Task 1.
- Produces: nothing downstream.

- [ ] **Step 1: Request-form Paper → §8 gradient-header pattern**

Replace:

```tsx
      <Paper sx={{ p: 3, mb: 3, border: '1px solid #e0e0e0', borderRadius: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, color: NET_PACIFIC_COLORS.primary }}>
          Request Cash Advance
        </Typography>
```

with:

```tsx
      <Paper sx={{ mb: 3, borderRadius: 2, overflow: 'hidden', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #e2e8f0' }}>
        <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0' }}>
          <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
            Request Cash Advance
          </Typography>
        </Box>
        <Box sx={{ p: 2 }}>
```

and close the new inner `Box` right before the Paper's closing tag (after the action-button row `</Box>`, ~line 1036: change `        </Box>\n      </Paper>` to `        </Box>\n        </Box>\n      </Paper>`).

- [ ] **Step 2: Breakdown table header typography**

In the breakdown `TableHead` (~937), replace the row:

```tsx
              <TableRow sx={{ bgcolor: NET_PACIFIC_COLORS.primary + '08' }}>
                <TableCell sx={{ fontWeight: 600, width: 160 }}>Category</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Details</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 120 }} align="right">Amount</TableCell>
                <TableCell sx={{ width: 96 }} />
              </TableRow>
```

with:

```tsx
              <TableRow>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem', width: 160 }}>Category</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Details</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem', width: 120 }} align="right">Amount</TableCell>
                <TableCell sx={{ width: 96 }} />
              </TableRow>
```

(No `stickyHeader` here — a short editable grid, never tall enough to scroll. Body cells are input fields; leave them.)

- [ ] **Step 3: CA list — title into a §7b header bar, standard container + header cells**

Replace (~1089–1097):

```tsx
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: NET_PACIFIC_COLORS.primary }}>
        {isAdmin ? 'All CA requests (monitor and approve)' : 'My CA requests'}
      </Typography>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ border: '1px solid #e0e0e0', borderRadius: 1 }}>
```

with:

```tsx
      <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2, background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #e2e8f0' }}>
        <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0' }}>
          <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
            {isAdmin ? `All CA requests (${list.length})` : `My CA requests (${list.length})`}
          </Typography>
        </Box>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer sx={{ maxHeight: 'calc(100vh - 480px)', minHeight: 300 }}>
```

Close the new `Paper` after the `TableContainer`'s closing `)}` (~1325): change

```tsx
        </TableContainer>
      )}
      <PdfPreviewDialog
```

to

```tsx
        </TableContainer>
      )}
      </Paper>
      <PdfPreviewDialog
```

(The admin subtitle "(monitor and approve)" is replaced by the standard `(count)` header-bar convention from §7b.)

- [ ] **Step 4: CA list header cells + row striping**

Replace the header row block (~1100–1118) — drop the tinted row bg and per-cell `color`, add the standard font size:

```tsx
              <TableRow>
                <TableCell sx={{ width: 36 }} />
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap' }}>CA No.</TableCell>
                {isAdmin && (
                  <>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>User</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Full name</TableCell>
                  </>
                )}
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Amount</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Balance</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Project</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Breakdown</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Requested</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }} align="right">
                  Actions
                </TableCell>
              </TableRow>
```

Then change the opening `<TableBody>` (~1120) to stripe every other **pair** (each CA = main row + collapse row, so `4n+1` hits every other main row — the Global Constraints deviation):

```tsx
            <TableBody sx={{ '& > tr:nth-of-type(4n+1)': { backgroundColor: 'rgba(0,0,0,0.02)' } }}>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit` — expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/components/CAFormPage.tsx
git commit -m "refactor(ca-form): section Papers and table styling per design system

Gradient-header Papers for the request form and CA list, standard
header/body table typography, internal scroll on the CA list, and
pair-aware row striping (each CA renders a main + collapse row, so
nth-of-type(4n+1) stripes every other CA instead of tinting all rows).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Dialog polish

**Files:**
- Modify: `src/components/CAFormPage.tsx` (delete dialog ~1333/1341, close-and-settle dialog ~1354, funding dialog ~1393/1461)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing downstream.

- [ ] **Step 1: DialogTitles → fontWeight 600**

Three edits:

```tsx
        <DialogTitle sx={{ fontWeight: 600 }}>Delete {confirmDelete?.ca_no || 'cash advance'}?</DialogTitle>
```

```tsx
        <DialogTitle sx={{ fontWeight: 600 }}>Close &amp; Settle — {closeTarget?.ca_no || closeTarget?.id}</DialogTitle>
```

```tsx
        <DialogTitle sx={{ fontWeight: 600 }}>
          Funding Source — {fundingEditTarget?.ca_no || fundingEditTarget?.id}
        </DialogTitle>
```

- [ ] **Step 2: DialogActions padding**

The close-and-settle dialog already has `sx={{ px: 3, pb: 2 }}`. Add the same to the other two:

```tsx
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
```

```tsx
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeFundingEdit} disabled={savingFunding}>Cancel</Button>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit` — expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/components/CAFormPage.tsx
git commit -m "style(ca-form): standard dialog title weight and actions padding

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Browser verification (employee + admin) and push

**Files:**
- Create: mock server script in the session scratchpad (NOT in the repo), e.g. `<scratchpad>/mock-api.js`
- No repo files modified.

**Interfaces:**
- Consumes: the restyled page from Tasks 1–4; repo-local skill `.claude/skills/verify/SKILL.md`.
- Produces: verification evidence (screenshots) — nothing downstream.

- [ ] **Step 1: Start client + mock API per the repo `verify` skill**

Client via preview tools (`pmv2-client`, port 3000). Mock express API on 3001 (repo's own express, CORS with origin echo + credentials + `Content-Type,Authorization`, 204 OPTIONS) implementing:

- `POST /api/auth/login` — switchable user: return admin `{ id: 'a1', username: 'adm', full_name: 'Test Admin', role: 'admin' }` when the posted username is `adm`, else employee `{ id: 'u1', username: 'emp', full_name: 'Test Employee', role: 'user' }`. `GET /api/auth/me` returns whoever last logged in.
- `GET /api/cash-advances` → for the employee: one approved CA with positive balance (`{ id: 'ca1', ca_no: 'CA-0001', user_id: 'u1', amount: 5000, balance_remaining: 3200, status: 'approved', purpose: 'Materials for site survey', project_id: null, breakdown: [{ category: 'Materials', amount: 5000 }], requested_at: 1751500000, created_at: 1751500000 }`) plus one pending (`{ id: 'ca2', ca_no: 'CA-0002', user_id: 'u1', amount: 1500, balance_remaining: 1500, status: 'pending', … }`). For the admin: those two plus a second employee's approved CA with negative balance (`user_id: 'u2', full_name: 'Other Person', amount: 2000, balance_remaining: -300`) so "Company Owes" shows.
- `GET /api/liquidations` → one submitted liquidation on ca1 (`{ id: 'liq1', ca_id: 'ca1', user_id: 'u1', status: 'submitted', total_amount: 1800, created_at: 1751600000 }`).
- `GET /api/projects` → `[]`; `GET /api/investments` → `{ success: true, investments: [] }`; 404 for `/api/users/staff-contacts` and `/api/calcsheet/settings`.

- [ ] **Step 2: Employee walkthrough**

Log in as `emp`, go to `/employee/ca-form`, resize ~1512x900. Verify: h4 title, default color; 4 gradient KPI cards (Approved CAs = 1, Total Approved = 5,000.00, Holds Unliquidated = 3,200.00 on yellow, Company Owes = — on green); "My CA requests (2)" header bar on a gradient-header Paper; striping on alternating CA pairs; expand ca1 → shows the 1,800.00 submitted liquidation. Screenshot.

- [ ] **Step 3: Admin walkthrough**

Log in as `adm`, go to `/finance/ca-form` (or whichever ca-form route the admin uses — any of the three routes renders the same page). Verify: "Cash Advance Balances by Employee" gradient-header Paper with the restyled table (two employee rows, warning/error coloring intact); "All CA requests (3)"; Approve/Reject buttons visible on the pending row; open the Funding Source dialog and the Delete dialog — titles bold-600, actions padded. Screenshot.

- [ ] **Step 4: Console/network check**

Preview console (error level) clean; only the optionally-404 endpoints from the verify skill may fail.

- [ ] **Step 5: Push**

```bash
git push
```

Report results with both screenshots. Nothing further to commit (Task 5 touches no repo files).

---

## Self-review notes

- Spec coverage: colors/title/root (Task 1 = spec items 1, 2, 7), KPI cards + admin table (Task 2 = item 3), Papers/tables (Task 3 = items 4, 5), dialogs (Task 4 = item 6), verification (Task 5 = spec Verification section). No gaps.
- The striping deviation (`4n+1` vs `odd`) is called out in Global Constraints and the Task 3 commit message — deliberate, reviewed against the paired-row DOM structure.
- Type consistency: only shared identifiers are `NET_PACIFIC_COLORS` (defined Task 1, used Tasks 2–3) and unchanged existing state/vars quoted verbatim from the file.
- Zero-behavior check: no handler, fetch, or state logic is touched in any task; every step is sx/markup-only, and values render with the same formatting/placeholders as before.
