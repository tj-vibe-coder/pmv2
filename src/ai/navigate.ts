const BLOCKED_PREFIXES = [
  '/settings',
  '/users',
  '/user-approvals',
  '/finance/payroll',
  '/employee/payslips',
  '/employee/dtr',
  '/login',
  '/scan',
];

const ALLOWED_PATTERNS = [
  /^\/dashboard\/?$/,
  /^\/projects\/?$/,
  /^\/projects\/[^/]+\/?$/,
  /^\/sales\/?$/,
  /^\/sales\/calcsheet\/projects\/?$/,
  /^\/sales\/calcsheet\/projects\/[^/]+\/?$/,
  /^\/sales\/calcsheet\/quotations\/[^/]+\/?$/,
  /^\/sales\/clients\/?$/,
  /^\/clients\/?$/,
  /^\/finance\/projects\/[^/]+\/expenses\/?$/,
  /^\/expense-monitoring\/?$/,
  /^\/finance\/expense-monitoring\/?$/,
];

function pathnameOf(route: string): string | null {
  if (typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//')) {
    return null;
  }
  const path = route.split(/[?#]/)[0];
  if (!path || path.includes('..')) return null;
  return path;
}

export function resolveAiNavigatePath(route: string): string | null {
  const path = pathnameOf(route);
  if (!path) return null;
  if (BLOCKED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return null;
  }
  if (path === '/projects' || path === '/projects/') return '/dashboard';
  if (path === '/clients' || path === '/clients/') return '/sales/clients';
  if (!ALLOWED_PATTERNS.some((pattern) => pattern.test(path))) return null;
  return path;
}

export function applyAiNavigation(
  navigate: (to: string) => void,
  route: string,
): boolean {
  const dest = resolveAiNavigatePath(route);
  if (!dest) return false;
  navigate(dest);
  return true;
}
