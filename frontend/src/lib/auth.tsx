import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PublicUser, UserRole } from '../../../shared/types.ts';
import { ApiRequestError, onSessionEnded, setCsrfToken } from '../api/client.ts';
import { authApi } from '../api/endpoints.ts';

/**
 * Who is signed in. The session itself is an HttpOnly cookie the browser sends automatically (scripts cannot read
 * it); this only keeps the account's name and role for the screens, and the anti-forgery token in memory.
 */
export interface AuthState {
  status: 'loading' | 'signed-in' | 'signed-out';
  user: PublicUser | null;
}

export interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  status: 'loading',
  user: null,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  const signedOut = useCallback(() => {
    setCsrfToken(null);
    setState({ status: 'signed-out', user: null });
  }, []);

  useEffect(() => {
    onSessionEnded(signedOut);
    authApi
      .me()
      .then((r) => {
        setCsrfToken(r.csrfToken);
        setState({ status: 'signed-in', user: r.user });
      })
      .catch(signedOut);
    return () => onSessionEnded(null);
  }, [signedOut]);

  const login = useCallback(async (username: string, password: string) => {
    const r = await authApi.login(username, password);
    setCsrfToken(r.csrfToken);
    setState({ status: 'signed-in', user: r.user });
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (err) {
      // Already signed out on the server: fine. Anything else: still clear this screen.
      if (!(err instanceof ApiRequestError)) throw err;
    } finally {
      signedOut();
    }
  }, [signedOut]);

  return <AuthContext.Provider value={{ ...state, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export const ROLE_HOME: Record<UserRole, string> = { driver: '/driver', employee: '/shop' };
export const ROLE_LABEL: Record<UserRole, string> = { driver: 'Driver', employee: 'Shop employee' };
