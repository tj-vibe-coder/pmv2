import { applyAiNavigation, resolveAiNavigatePath } from './navigate';

it('allows record and list routes used by Assist citations', () => {
  expect(resolveAiNavigatePath('/projects/p1')).toBe('/projects/p1');
  expect(resolveAiNavigatePath('/sales/calcsheet/projects/opp1')).toBe('/sales/calcsheet/projects/opp1');
  expect(resolveAiNavigatePath('/sales/calcsheet/quotations/q1')).toBe('/sales/calcsheet/quotations/q1');
  expect(resolveAiNavigatePath('/finance/projects/p1/expenses')).toBe('/finance/projects/p1/expenses');
  expect(resolveAiNavigatePath('/dashboard')).toBe('/dashboard');
  expect(resolveAiNavigatePath('/sales/clients')).toBe('/sales/clients');
  expect(resolveAiNavigatePath('/clients')).toBe('/sales/clients');
});

it('maps the legacy /projects list citation to /dashboard', () => {
  expect(resolveAiNavigatePath('/projects')).toBe('/dashboard');
});

it('rejects blocked, off-app, and invented paths', () => {
  expect(resolveAiNavigatePath('/settings/users')).toBeNull();
  expect(resolveAiNavigatePath('/finance/payroll')).toBeNull();
  expect(resolveAiNavigatePath('/employee/payslips')).toBeNull();
  expect(resolveAiNavigatePath('https://evil.example/projects/p1')).toBeNull();
  expect(resolveAiNavigatePath('//evil.example')).toBeNull();
  expect(resolveAiNavigatePath('/employee/ca-form')).toBeNull();
  expect(resolveAiNavigatePath('/sales/calcsheet/presets')).toBeNull();
});

it('only calls navigate when the route is allowlisted', () => {
  const navigate = jest.fn();
  expect(applyAiNavigation(navigate, '/projects/p1')).toBe(true);
  expect(applyAiNavigation(navigate, '/finance/payroll')).toBe(false);
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith('/projects/p1');
});
