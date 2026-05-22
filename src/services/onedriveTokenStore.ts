/**
 * Non-React access point for OneDrive auth state.
 *
 * The Zustand quotation store and other non-component modules need to know
 * whether OneDrive is signed in and to acquire a fresh access token without
 * being able to call React hooks. `OneDriveAuthProvider` populates this
 * singleton on mount, login, and logout; callers read from it directly.
 *
 * Best-effort by design: `getToken()` returns `null` if not signed in or if
 * silent token acquisition fails, so callers must always handle the null path
 * and never block primary user actions on OneDrive availability.
 */

type TokenGetter = () => Promise<string | null>;

interface OneDriveTokenStore {
  isAuthenticated: boolean;
  getToken: TokenGetter;
}

const noopGetToken: TokenGetter = async () => null;

let current: OneDriveTokenStore = {
  isAuthenticated: false,
  getToken: noopGetToken,
};

/** Called by OneDriveAuthProvider whenever auth state or token getter changes. */
export function setOneDriveTokenStore(next: OneDriveTokenStore): void {
  current = next;
}

/** Read current OneDrive auth state from anywhere (e.g. Zustand stores). */
export function getOneDriveTokenStore(): OneDriveTokenStore {
  return current;
}
