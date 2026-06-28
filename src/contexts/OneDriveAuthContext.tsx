import React, { createContext, useContext, useEffect } from 'react';
import { setOneDriveTokenStore } from '../services/onedriveTokenStore';

// OneDrive now uses a server-side app-only service account (see server.js /api/onedrive/*).
// Per-user MSAL sign-in has been removed; this stub keeps the old API so existing
// consumers compile and behave as "always signed in" (the server enforces real auth).
interface OneDriveAuthContextValue {
  isConfigured: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const STUB: OneDriveAuthContextValue = {
  isConfigured: true,
  isAuthenticated: true,
  isLoading: false,
  error: null,
  login: async () => {},
  logout: async () => {},
  // Returns a non-null placeholder. The server resolves the real Graph token; the
  // onedriveFolderService passes this through but ignores it.
  getAccessToken: async () => 'server',
};

const OneDriveAuthContext = createContext<OneDriveAuthContextValue>(STUB);

export const OneDriveAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    // Bridge for non-React callers (e.g. quotationStore) that read the token store.
    setOneDriveTokenStore({ isAuthenticated: true, getToken: async () => 'server' });
  }, []);
  return <OneDriveAuthContext.Provider value={STUB}>{children}</OneDriveAuthContext.Provider>;
};

export function useOneDriveAuth(): OneDriveAuthContextValue {
  return useContext(OneDriveAuthContext);
}
