import { lazy, type ComponentType } from 'react';

const RELOAD_KEY = 'pmv2_chunk_reload';

const flag = {
  get: () => { try { return sessionStorage.getItem(RELOAD_KEY); } catch { return null; } },
  set: () => { try { sessionStorage.setItem(RELOAD_KEY, '1'); } catch { /* storage unavailable */ } },
  clear: () => { try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* storage unavailable */ } },
};

/**
 * React.lazy for a page, with one safety net: each deploy replaces the hashed page files, so a tab that was
 * opened before a deploy can no longer download the code of a page it hasn't visited yet. When that happens,
 * reload once to pick up the new version instead of showing a broken page. A second failure in the same
 * session (genuinely offline, say) is thrown so the error boundary can show a "Reload" button.
 */
export function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await factory();
      flag.clear();
      return mod;
    } catch (err) {
      if (!flag.get()) {
        flag.set();
        window.location.reload();
        return new Promise<{ default: T }>(() => { /* page is reloading */ });
      }
      throw err;
    }
  });
}
