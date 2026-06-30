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
