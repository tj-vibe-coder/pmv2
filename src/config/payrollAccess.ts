/**
 * Payroll access control.
 * Only TJC (Tyrone) and RJR (Reuel) may access the Payroll module.
 * Access is based on username from the custom auth system.
 */
export const PAYROLL_AUTHORIZED_USERNAMES: string[] = ['TJC', 'RJR'];

export function isPayrollAuthorized(username: string | undefined): boolean {
  if (!username) return false;
  return PAYROLL_AUTHORIZED_USERNAMES.includes(username);
}
