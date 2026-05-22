import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, LoginCredentials, AuthResponse } from '../types/User';
import { API_BASE } from '../config/api';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('netpacific_token');
    if (!savedToken) {
      setIsLoading(false);
      return;
    }
    // Optimistically restore the cached user so we don't flash the login screen on
    // mount. /api/auth/me will refresh the data shortly after.
    const cachedUserRaw = localStorage.getItem('netpacific_user');
    if (cachedUserRaw) {
      try {
        setUser(JSON.parse(cachedUserRaw));
      } catch {
        // ignore malformed cache
      }
    }
    // Refetch current user from server so we have latest full_name and other fields.
    // IMPORTANT: only clear tokens on an explicit 401 from the server. Transient
    // network errors (CORS, dev-server restart, timing during an OAuth redirect chain,
    // offline mode, etc.) must NOT log the user out — that's user-hostile and was the
    // cause of an apparent logout when OneDrive's loginRedirect flow returned to the app.
    fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${savedToken}` } })
      .then(async (res) => {
        if (res.status === 401) {
          // Real auth failure — token is invalid/expired. Clear and bail.
          localStorage.removeItem('netpacific_user');
          localStorage.removeItem('netpacific_token');
          setUser(null);
          return;
        }
        if (!res.ok) {
          // Server hiccup — keep the cached session, try again on next mount.
          // eslint-disable-next-line no-console
          console.warn(`[Auth] /api/auth/me returned ${res.status}; keeping cached session`);
          return;
        }
        const data = await res.json();
        if (data.success && data.user) {
          setUser(data.user);
          localStorage.setItem('netpacific_user', JSON.stringify(data.user));
        } else if (data?.error === 'Unauthorized' || data?.code === 401) {
          // Server returned 200 with an explicit unauthorized payload (some APIs do this).
          localStorage.removeItem('netpacific_user');
          localStorage.removeItem('netpacific_token');
          setUser(null);
        }
        // Else: keep the cached session as-is.
      })
      .catch((err) => {
        // Network error — keep the cached session, don't log the user out.
        // eslint-disable-next-line no-console
        console.warn('[Auth] /api/auth/me network error; keeping cached session:', err);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      const result: AuthResponse = await response.json();

      if (result.success && result.user && result.token) {
        setUser(result.user);
        localStorage.setItem('netpacific_user', JSON.stringify(result.user));
        localStorage.setItem('netpacific_token', result.token);
        return { success: true };
      } else {
        return { success: false, error: result.error || 'Login failed' };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Network error occurred' };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('netpacific_user');
    localStorage.removeItem('netpacific_token');
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};