const LAST_PAGE_KEY = 'pmv2:lastPage';

// Routes that should never be remembered as "the page to resume into" — either
// because they're transient/non-landing (login, a bare scan action) or because
// resuming into them would be a no-op or a loop.
const EXCLUDED_PATHS = ['/', '/login', '/scan'];

export function saveLastPage(path: string): void {
  if (EXCLUDED_PATHS.includes(path)) return;
  try { localStorage.setItem(LAST_PAGE_KEY, path); } catch { /* storage unavailable (private mode, quota) */ }
}

export function getLastPage(): string | null {
  let path: string | null;
  try { path = localStorage.getItem(LAST_PAGE_KEY); } catch { return null; }
  // Only ever navigate to a same-app relative path — guards against a
  // protocol-relative value ("//evil.com") somehow ending up in storage.
  if (!path || !path.startsWith('/') || path.startsWith('//') || EXCLUDED_PATHS.includes(path)) return null;
  return path;
}

export function clearLastPage(): void {
  try { localStorage.removeItem(LAST_PAGE_KEY); } catch { /* ignore */ }
}
