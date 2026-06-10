/**
 * Payroll access control.
 * Access is based on username from the custom auth system.
 *
 * TEMPORARILY OPEN TO ALL USERS (Jun 2026, per RJ) — every logged-in user can
 * see and use the Payroll pane. To restore the allowlist, set
 * PAYROLL_OPEN_TO_ALL back to false (allowlist: TJC, RJR).
 */
export const PAYROLL_OPEN_TO_ALL = true;

export const PAYROLL_AUTHORIZED_USERNAMES: string[] = ['TJC', 'RJR'];

export function isPayrollAuthorized(username: string | undefined): boolean {
  if (PAYROLL_OPEN_TO_ALL) return true;
  if (!username) return false;
  return PAYROLL_AUTHORIZED_USERNAMES.includes(username);
}
