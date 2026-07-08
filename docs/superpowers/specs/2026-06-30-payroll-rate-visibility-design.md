# Payroll Rate Visibility & Role-Based Access

**Date**: 2026-06-30
**Status**: Approved
**Author**: TJ + Claude

## Summary

Gate employee rate visibility (dailyRate/monthlyRate) to superadmin only, refactor payroll access from a hardcoded username whitelist to role-based checks, and ensure employees can still see their own rate on their own payslips.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Payroll access | `superadmin` + `admin` roles | Replace hardcoded `['TJC', 'RJR']` with role check |
| Rate visibility | Superadmin only + own payslip | Admins can run payroll but can't see rates; employees see their own |
| Rate editing | Employee edit form (superadmin only) | Rates are employee properties, not per-run overrides |
| Scope | Access control only — no new pages/endpoints/schema | Existing infrastructure works, just needs gating |

## Rate Visibility Rule

**You can see the rate if:** (a) your role is `superadmin`, OR (b) it's your own payslip.

| Location | superadmin | admin | employee (own) |
|----------|-----------|-------|----------------|
| Employee edit form (UsersPage) | See & edit rate | Hidden | N/A |
| PayrollRunForm Step 2 (DTR) | See rate column | Hidden | N/A |
| PayrollRunForm Step 3 (Preview) | Full detail | Gross/deductions/net only | N/A |
| PayslipCard (viewing others) | See rate | Hidden | N/A |
| PayslipCard (viewing own) | See rate | See rate | See rate |
| Employee Portal (my-payslips) | N/A | N/A | See rate (own data) |

## Server Changes (`server.js`)

### Refactor `requirePayrollAccess` middleware

Replace:
```javascript
const PAYROLL_USERS = ['TJC', 'RJR'];
// checks username against whitelist
```

With:
```javascript
function requirePayrollAccess(req, res, next) {
  const user = getCurrentUser(req);
  if (!user || !['superadmin', 'admin'].includes(user.role)) {
    return res.status(403).json({ error: 'Payroll access denied' });
  }
  next();
}
```

### Add `isSuperadmin` helper

```javascript
function isSuperadmin(req) {
  const user = getCurrentUser(req);
  return user && user.role === 'superadmin';
}
```

### Strip rate from non-superadmin responses

For endpoints that return employee/payslip data to admin users (not superadmin), strip `dailyRate` and `monthlyRate` from the response unless the requesting user is superadmin or it's their own data.

Affected endpoints:
- `GET /api/payroll/employees` — strip rate fields for non-superadmin
- `GET /api/payroll/runs/:id` — strip rate from payslip data for non-superadmin
- `GET /api/payroll/my-payslips` — no change (always own data)

## Client Changes

### PayrollRunForm.tsx

- Read `user.role` from auth context
- Step 2 (DTR Entry): Conditionally render the rate column — show for `superadmin`, hide for `admin`
- Step 3 (Preview): For `admin`, show gross/deductions/net but hide rate breakdown line

### PayslipCard.tsx

- Add a `canSeeRate` prop (boolean)
- When `false`: hide the rate display line (dailyRate or monthlyRate)
- Callers determine `canSeeRate` based on: `user.role === 'superadmin' || payslip.employeeId === user.id`

### UsersPage.tsx (Employee Edit Form)

- Gate `dailyRate`, `monthlyRate`, and `mealAllowance` fields behind `user.role === 'superadmin'`
- Non-superadmin admins can edit other employee fields (name, position, etc.) but not rates

### Sidebar / Nav

- Show payroll nav item for `superadmin` and `admin` roles (replace any hardcoded username check in the sidebar)

## Out of Scope

- Payroll computation logic changes (payrollEngine.ts stays the same)
- New Firestore fields or collections
- New pages or endpoints
- Employee portal changes (already works correctly)
- Rate override per payroll run (rates live on the employee profile)
