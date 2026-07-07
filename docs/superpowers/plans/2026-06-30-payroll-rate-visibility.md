# Payroll Rate Visibility & Role-Based Access — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate employee rate visibility to superadmin-only (or own payslip), and refactor payroll access from hardcoded username whitelist to role-based checks.

**Architecture:** Modify the server-side `requirePayrollAccess` middleware to check `user.role` instead of a username array. Add `isSuperadmin(req)` helper for rate-stripping on API responses. On the frontend, pass a `canSeeRate` flag through components based on `user.role === 'superadmin' || isOwnPayslip`. Update `payrollAccess.ts` config to be role-based.

**Tech Stack:** Express (server.js), React 19, TypeScript, MUI v7, Zustand

## Global Constraints

- Payroll access: `superadmin` and `admin` roles (replaces hardcoded `['TJC', 'RJR']`)
- Rate visibility: `superadmin` OR viewing own payslip
- No new Firestore fields, collections, or endpoints
- No changes to `payrollEngine.ts` computation logic
- `GET /api/payroll/my-payslips` stays open to any active user (no change)

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `server.js:1775-1782` | Replace username whitelist with role-based `requirePayrollAccess` |
| Modify | `server.js:1785-1791` | Strip rate from employee data for non-superadmin |
| Modify | `server.js:1942-1948` | Strip rate from payslip data for non-superadmin |
| Modify | `src/config/payrollAccess.ts` | Replace username-based check with role-based check |
| Modify | `src/components/finance/FinanceNavList.tsx:296` | Use role check instead of `isPayrollAuthorized(username)` |
| Modify | `src/components/payroll/PayslipCard.tsx:21-96` | Add `canSeeRate` prop, conditionally hide rate |
| Modify | `src/components/payroll/EmployeeForm.tsx:94-106` | Gate rate fields behind superadmin check |
| Modify | `src/components/payroll/PayrollRunForm.tsx` | Pass `canSeeRate` to PayslipCard in preview |

---

### Task 1: Server-Side Access Control Refactor + Rate Stripping

**Files:**
- Modify: `server.js` (lines 1775-1791, 1942-1948)

**Produces:**
- `requirePayrollAccess(req, res)` — returns user if `superadmin` or `admin`, else 403
- `isSuperadmin(req)` — returns boolean
- `stripRates(obj)` — removes `dailyRate`, `monthlyRate`, `mealAllowance` from object
- Rate-stripped responses on `GET /api/payroll/employees` and `GET /api/payroll/runs/:runId/payslips` for non-superadmin

- [ ] **Step 1: Replace `PAYROLL_USERS` and `requirePayrollAccess` in `server.js`**

Find the block at line 1775-1782:
```javascript
const PAYROLL_USERS = ['TJC', 'RJR'];

async function requirePayrollAccess(req, res) {
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  if (!PAYROLL_USERS.includes(user.username)) { res.status(403).json({ error: 'Payroll access restricted' }); return null; }
  return user;
}
```

Replace with:
```javascript
const PAYROLL_ROLES = ['superadmin', 'admin'];

async function requirePayrollAccess(req, res) {
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  if (!PAYROLL_ROLES.includes(user.role)) { res.status(403).json({ error: 'Payroll access restricted' }); return null; }
  return user;
}

function isSuperadmin(user) {
  return user && user.role === 'superadmin';
}

function stripRates(obj) {
  if (!obj) return obj;
  const { dailyRate, monthlyRate, mealAllowance, ...rest } = obj;
  return rest;
}
```

- [ ] **Step 2: Strip rates from `GET /api/payroll/employees` for non-superadmin**

Find the endpoint at line 1785-1791:
```javascript
app.get('/api/payroll/employees', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    const snap = await db.collection('payroll_employees').orderBy('name').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) { res.status(500).json({ error: 'Failed to fetch employees' }); }
});
```

Replace with:
```javascript
app.get('/api/payroll/employees', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    const snap = await db.collection('payroll_employees').orderBy('name').get();
    const employees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(isSuperadmin(user) ? employees : employees.map(e => stripRates(e)));
  } catch (err) { res.status(500).json({ error: 'Failed to fetch employees' }); }
});
```

- [ ] **Step 3: Strip rates from `GET /api/payroll/runs/:runId/payslips` for non-superadmin**

Find the endpoint at line 1942-1948:
```javascript
app.get('/api/payroll/runs/:runId/payslips', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    const snap = await db.collection('payroll_runs').doc(req.params.runId).collection('payslips').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) { res.status(500).json({ error: 'Failed to fetch payslips' }); }
});
```

Replace with:
```javascript
app.get('/api/payroll/runs/:runId/payslips', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    const snap = await db.collection('payroll_runs').doc(req.params.runId).collection('payslips').get();
    let payslips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!isSuperadmin(user)) {
      payslips = payslips.map(p => ({
        ...p,
        employeeSnapshot: p.employeeSnapshot ? stripRates(p.employeeSnapshot) : p.employeeSnapshot,
      }));
    }
    res.json(payslips);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch payslips' }); }
});
```

- [ ] **Step 4: Verify server starts**

Run: `cd /Users/tjc/PM/pmv2 && node -e "require('./server.js')" 2>&1 | head -5` (or start and check for syntax errors)

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat(payroll): replace username whitelist with role-based access and rate stripping"
```

---

### Task 2: Frontend Payroll Access Config + Nav

**Files:**
- Modify: `src/config/payrollAccess.ts`
- Modify: `src/components/finance/FinanceNavList.tsx` (line 296)

**Produces:**
- `isPayrollAuthorized(role)` — checks role instead of username
- Nav item visible to `superadmin` and `admin` roles

- [ ] **Step 1: Refactor `src/config/payrollAccess.ts`**

Replace the entire file content:

```typescript
/**
 * Payroll access control — role-based.
 *
 * superadmin: full access (create runs, view rates, edit rates)
 * admin: payroll access without rate visibility
 */

const PAYROLL_ROLES = ['superadmin', 'admin'];

export function isPayrollAuthorized(role: string | undefined): boolean {
  if (!role) return false;
  return PAYROLL_ROLES.includes(role);
}
```

- [ ] **Step 2: Update `FinanceNavList.tsx` to use role-based check**

Find line 296 in `src/components/finance/FinanceNavList.tsx`:
```tsx
{isPayrollAuthorized(user?.username) && user?.role !== 'tax_filer' && (
```

Replace with:
```tsx
{isPayrollAuthorized(user?.role) && (
```

Also update the import at line 26. Find:
```tsx
import { isPayrollAuthorized } from '../../config/payrollAccess';
```

This import stays the same — the function signature changed but the name didn't. No change needed here.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/tjc/PM/pmv2 && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add src/config/payrollAccess.ts src/components/finance/FinanceNavList.tsx
git commit -m "feat(payroll): refactor payroll nav access to role-based check"
```

---

### Task 3: PayslipCard Rate Visibility + EmployeeForm Rate Gating

**Files:**
- Modify: `src/components/payroll/PayslipCard.tsx` (lines 21-96)
- Modify: `src/components/payroll/EmployeeForm.tsx` (lines 94-106)

**Produces:**
- `PayslipCard` accepts `canSeeRate?: boolean` prop, hides rate when false
- `EmployeeForm` accepts `canEditRate?: boolean` prop, hides rate fields when false

- [ ] **Step 1: Add `canSeeRate` prop to `PayslipCard.tsx`**

Find the Props interface at line 21-24:
```typescript
interface Props {
  payslip: Payslip;
  onBack?: () => void;
}
```

Replace with:
```typescript
interface Props {
  payslip: Payslip;
  onBack?: () => void;
  canSeeRate?: boolean;
}
```

Update the component destructuring (find the function signature):
```tsx
export default function PayslipCard({ payslip: s, onBack }: Props) {
```

Replace with:
```tsx
export default function PayslipCard({ payslip: s, onBack, canSeeRate = true }: Props) {
```

- [ ] **Step 2: Conditionally render rate in PayslipCard**

Find the rate display block at lines 90-96:
```tsx
<Box>
  <Typography variant="caption" color="text.secondary">RATE</Typography>
  <Typography fontWeight={600}>{rate}</Typography>
</Box>
```

Wrap it with the `canSeeRate` check:
```tsx
{canSeeRate && (
  <Box>
    <Typography variant="caption" color="text.secondary">RATE</Typography>
    <Typography fontWeight={600}>{rate}</Typography>
  </Box>
)}
```

Also find the meal allowance display at lines 93-96:
```tsx
<Box>
  <Typography variant="caption" color="text.secondary">MEAL ALLOW.</Typography>
  <Typography fontWeight={600}>₱{fmt(emp.mealAllowance ?? 0)}/day</Typography>
</Box>
```

Wrap it the same way:
```tsx
{canSeeRate && (
  <Box>
    <Typography variant="caption" color="text.secondary">MEAL ALLOW.</Typography>
    <Typography fontWeight={600}>₱{fmt(emp.mealAllowance ?? 0)}/day</Typography>
  </Box>
)}
```

- [ ] **Step 3: Gate rate fields in `EmployeeForm.tsx`**

Find the daily rate field at lines 94-97:
```tsx
{form.employeeType === 'FIELD' && (
  <Grid size={{ xs: 12, sm: 4 }}>
    <TextField fullWidth label="Daily Rate (₱)" type="number" value={form.dailyRate} onChange={set('dailyRate')} inputProps={{ min: 0 }} />
  </Grid>
)}
```

Replace with:
```tsx
{form.employeeType === 'FIELD' && canEditRate && (
  <Grid size={{ xs: 12, sm: 4 }}>
    <TextField fullWidth label="Daily Rate (₱)" type="number" value={form.dailyRate} onChange={set('dailyRate')} inputProps={{ min: 0 }} />
  </Grid>
)}
```

Find the monthly rate field at lines 99-102:
```tsx
{form.employeeType === 'OFFICE' && (
  <Grid size={{ xs: 12, sm: 4 }}>
    <TextField fullWidth label="Monthly Rate (₱)" type="number" value={form.monthlyRate} onChange={set('monthlyRate')} inputProps={{ min: 0 }} />
  </Grid>
)}
```

Replace with:
```tsx
{form.employeeType === 'OFFICE' && canEditRate && (
  <Grid size={{ xs: 12, sm: 4 }}>
    <TextField fullWidth label="Monthly Rate (₱)" type="number" value={form.monthlyRate} onChange={set('monthlyRate')} inputProps={{ min: 0 }} />
  </Grid>
)}
```

Find the meal allowance field at lines 104-106:
```tsx
<Grid size={{ xs: 12, sm: 4 }}>
  <TextField fullWidth label="Meal Allowance (₱/day)" type="number" value={form.mealAllowance} onChange={set('mealAllowance')} inputProps={{ min: 0 }} />
</Grid>
```

Replace with:
```tsx
{canEditRate && (
  <Grid size={{ xs: 12, sm: 4 }}>
    <TextField fullWidth label="Meal Allowance (₱/day)" type="number" value={form.mealAllowance} onChange={set('mealAllowance')} inputProps={{ min: 0 }} />
  </Grid>
)}
```

Add `canEditRate` to the component's props. Find the component signature and add the prop:
```tsx
// Add canEditRate to the props interface
canEditRate?: boolean;
```

Default it to `true` in the destructuring so existing callers aren't broken.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/tjc/PM/pmv2 && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/payroll/PayslipCard.tsx src/components/payroll/EmployeeForm.tsx
git commit -m "feat(payroll): add canSeeRate/canEditRate props for rate visibility gating"
```

---

### Task 4: Wire Up Role Checks in Parent Components

**Files:**
- Modify: `src/components/payroll/PayrollRunForm.tsx`
- Modify: Any parent that renders `EmployeeForm` (find where EmployeeForm is used)
- Modify: `src/components/employee/EmployeePayslipPage.tsx` (passes `canSeeRate` to PayslipCard)

**Consumes:**
- `useAuth()` from `src/contexts/AuthContext.tsx` — provides `user.role`
- `PayslipCard` with `canSeeRate` prop (from Task 3)
- `EmployeeForm` with `canEditRate` prop (from Task 3)

- [ ] **Step 1: Pass `canSeeRate` in PayrollRunForm.tsx**

The PayrollRunForm uses `useAuth` already (line 25: `const { user } = useAuth();`).

Find where PayslipCard is rendered in Step 3 preview. Search for `<PayslipCard` in the file. Add the `canSeeRate` prop:

```tsx
<PayslipCard payslip={payslip} canSeeRate={user?.role === 'superadmin'} />
```

- [ ] **Step 2: Pass `canEditRate` where EmployeeForm is rendered**

Search the codebase for `<EmployeeForm` to find its parent. Add:

```tsx
<EmployeeForm ... canEditRate={user?.role === 'superadmin'} />
```

The parent needs `useAuth` to access `user.role`. If it doesn't already import `useAuth`, add it.

- [ ] **Step 3: Pass `canSeeRate` in EmployeePayslipPage.tsx**

In `src/components/employee/EmployeePayslipPage.tsx`, find where PayslipCard is rendered. Since this is the employee portal (viewing own payslips), always pass `canSeeRate={true}`:

```tsx
<PayslipCard payslip={selectedPayslip} canSeeRate={true} />
```

This ensures employees always see their own rate.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/tjc/PM/pmv2 && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 5: Test in browser**

1. Log in as superadmin → navigate to Payroll → verify rate fields visible on employee form, rate visible in payslip previews
2. Log in as admin → navigate to Payroll → verify rate fields hidden on employee form, rate hidden in payslip previews
3. Log in as regular employee → navigate to Employee Portal → My Payslips → verify own rate is visible

- [ ] **Step 6: Commit**

```bash
git add src/components/payroll/PayrollRunForm.tsx src/components/employee/EmployeePayslipPage.tsx [other modified files]
git commit -m "feat(payroll): wire up role-based rate visibility across all payroll views"
```
