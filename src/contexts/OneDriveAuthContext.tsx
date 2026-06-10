import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { PublicClientApplication, AuthenticationResult, LogLevel } from '@azure/msal-browser';
import { onedriveConfig, isOneDriveConfigured } from '../config/onedriveConfig';
import { setOneDriveTokenStore } from '../services/onedriveTokenStore';

interface OneDriveAuthContextValue {
  isConfigured: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const OneDriveAuthContext = createContext<OneDriveAuthContextValue | null>(null);

const msalConfig = {
  auth: {
    clientId: onedriveConfig.clientId,
    authority: `https://login.microsoftonline.com/${onedriveConfig.tenantId}`,
    redirectUri: onedriveConfig.redirectUri,
  },
  cache: {
    cacheLocation: 'localStorage' as const,
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      loggerCallback: (level: LogLevel, message: string, _containsPii: boolean) => {
        if (level === LogLevel.Error) console.error('[MSAL]', message);
        else if (level === LogLevel.Warning) console.warn('[MSAL]', message);
        else if (level === LogLevel.Info) console.info('[MSAL]', message);
        // Verbose dropped to keep console quiet
      },
      logLevel: LogLevel.Info,
      piiLoggingEnabled: false,
    },
  },
};

let msalInstance: PublicClientApplication | null = null;

function getMsalInstance(): PublicClientApplication | null {
  if (!isOneDriveConfigured()) return null;
  if (!msalInstance) {
    msalInstance = new PublicClientApplication(msalConfig);
  }
  return msalInstance;
}

/**
 * Acquire an access token for the cached account. Azure caps SPA refresh
 * tokens at 24 hours, so acquireTokenSilent starts failing one day after
 * sign-in even though the account is still cached. When that happens, fall
 * back to ssoSilent, which renews tokens through a hidden iframe using the
 * Microsoft session cookie — no user interaction, no page navigation. Returns
 * null only when both paths fail (e.g. third-party cookies blocked AND the
 * refresh token expired), in which case an interactive login is required.
 */
async function acquireTokenWithFallback(msal: PublicClientApplication): Promise<string | null> {
  const accounts = msal.getAllAccounts();
  if (accounts.length === 0) return null;
  try {
    const result: AuthenticationResult = await msal.acquireTokenSilent({
      scopes: onedriveConfig.scopes,
      account: accounts[0],
    });
    return result?.accessToken || null;
  } catch {
    try {
      const result = await msal.ssoSilent({
        scopes: onedriveConfig.scopes,
        loginHint: accounts[0].username,
      });
      return result?.accessToken || null;
    } catch {
      return null;
    }
  }
}

export const OneDriveAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isConfigured = isOneDriveConfigured();

  const initMsal = useCallback(async () => {
    if (!isConfigured) {
      setIsLoading(false);
      return;
    }
    try {
      const msal = getMsalInstance();
      if (!msal) {
        setIsLoading(false);
        return;
      }
      await msal.initialize();
      // Process any pending redirect response from loginRedirect. Must be called
      // before any other interactive MSAL API so the auth code in the URL is
      // exchanged for tokens and the account is cached.
      const redirectResponse = await msal.handleRedirectPromise().catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[OneDrive] handleRedirectPromise error', err);
        return null;
      });
      if (redirectResponse?.account) {
        // eslint-disable-next-line no-console
        console.info('[OneDrive] redirect response account=', redirectResponse.account.username);
      }
      const accounts = msal.getAllAccounts();
      setIsAuthenticated(accounts.length > 0);
      if (accounts.length > 0) {
        // Warm the token cache in the background so a 24h-expired refresh
        // token is renewed via ssoSilent at app open instead of failing
        // mid-action (e.g. during a report upload). Best-effort.
        void acquireTokenWithFallback(msal);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OneDrive init failed');
    } finally {
      setIsLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    initMsal();
  }, [initMsal]);

  const login = useCallback(async () => {
    if (!isConfigured) {
      setError('OneDrive is not configured. Add REACT_APP_ONEDRIVE_CLIENT_ID to .env');
      throw new Error('OneDrive not configured');
    }
    setError(null);
    const msal = getMsalInstance();
    if (!msal) throw new Error('MSAL instance unavailable');
    try {
      // Redirect flow (vs popup): more reliable in MSAL.js v5 because Microsoft's
      // login pages set Cross-Origin-Opener-Policy headers that can break the
      // popup → parent BroadcastChannel handshake. Redirect navigates the whole
      // tab to Microsoft and back, with the response processed by
      // handleRedirectPromise() on app reload (see initMsal above). One page
      // reload per session; after that, acquireTokenSilent serves all calls.
      // eslint-disable-next-line no-console
      console.info('[OneDrive] loginRedirect called; scopes=', onedriveConfig.scopes, 'redirectUri=', onedriveConfig.redirectUri);
      // redirectStartPage: after the Microsoft round-trip lands on the
      // registered redirectUri (site root) and handleRedirectPromise()
      // processes the response, MSAL navigates back to the page the user
      // started from — instead of stranding them on the homepage.
      await msal.loginRedirect({
        scopes: onedriveConfig.scopes,
        redirectStartPage: window.location.href,
      });
      // Note: control does not return from loginRedirect — the browser navigates
      // away. Anything after this line only runs if the call rejected.
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Login failed';
      setError(msg);
      // eslint-disable-next-line no-console
      console.error('[OneDrive] loginRedirect error', e);
      throw e;
    }
  }, [isConfigured]);

  const logout = useCallback(async () => {
    try {
      const msal = getMsalInstance();
      if (msal) {
        const accounts = msal.getAllAccounts();
        if (accounts.length > 0) {
          await msal.logoutPopup();
        }
        setIsAuthenticated(false);
      }
    } catch (_) {
      setIsAuthenticated(false);
    }
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (!isConfigured) return null;
    const msal = getMsalInstance();
    if (!msal) return null;
    return acquireTokenWithFallback(msal);
  }, [isConfigured]);

  // Publish auth state to the non-React singleton so the Zustand store and other
  // non-component code (services, utilities) can acquire tokens without using hooks.
  useEffect(() => {
    setOneDriveTokenStore({
      isAuthenticated,
      getToken: getAccessToken,
    });
  }, [isAuthenticated, getAccessToken]);

  const value: OneDriveAuthContextValue = {
    isConfigured,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    getAccessToken,
  };

  return (
    <OneDriveAuthContext.Provider value={value}>
      {children}
    </OneDriveAuthContext.Provider>
  );
};

export function useOneDriveAuth(): OneDriveAuthContextValue {
  const ctx = useContext(OneDriveAuthContext);
  if (!ctx) {
    return {
      isConfigured: false,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      login: async () => {},
      logout: async () => {},
      getAccessToken: async () => null,
    };
  }
  return ctx;
}
