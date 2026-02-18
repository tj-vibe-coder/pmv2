import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { PublicClientApplication, AuthenticationResult } from '@azure/msal-browser';
import { onedriveConfig, isOneDriveConfigured } from '../config/onedriveConfig';

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
};

let msalInstance: PublicClientApplication | null = null;

function getMsalInstance(): PublicClientApplication | null {
  if (!isOneDriveConfigured()) return null;
  if (!msalInstance) {
    msalInstance = new PublicClientApplication(msalConfig);
  }
  return msalInstance;
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
      const accounts = msal.getAllAccounts();
      setIsAuthenticated(accounts.length > 0);
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
      return;
    }
    setError(null);
    try {
      const msal = getMsalInstance();
      if (!msal) return;
      const result = await msal.loginPopup({ scopes: onedriveConfig.scopes });
      if (result?.account) {
        setIsAuthenticated(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
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
    try {
      const msal = getMsalInstance();
      if (!msal) return null;
      const accounts = msal.getAllAccounts();
      if (accounts.length === 0) return null;
      const result: AuthenticationResult = await msal.acquireTokenSilent({
        scopes: onedriveConfig.scopes,
        account: accounts[0],
      });
      return result?.accessToken || null;
    } catch {
      return null;
    }
  }, [isConfigured]);

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
