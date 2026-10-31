import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthUser } from '../types';
import { authApi, setUnauthorizedHandler } from '../api/client';

interface AuthState {
  user: AuthUser | null;
  /** True until the first /auth/me resolves, so we never flash the landing page at a signed-in user. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    authApi.me()
      .then(({ user: me }) => { if (!cancelled) setUser(me); })
      // A failure here means the API is unreachable, not that the user is signed
      // out; the app's own load error surfaces that.
      .catch(() => { if (!cancelled) setUser(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Any 401 from anywhere in the app drops us back to signed-out.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setUser((await authApi.login(email, password)).user);
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    setUser((await authApi.register(email, password, name)).user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // Even if the call fails, stop showing data the session can no longer fetch.
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}
