import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { apiClient } from '../../lib/api/client';
import { AuthContext } from './authContextValue';
import { clearStoredToken, getStoredToken, storeToken } from './tokenStorage';
import { getCurrentUserRequest, loginRequest, logoutRequest } from './authApi';
import type { AuthContextValue, AuthUser, LoginCredentials } from './types';

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isHydrating, setIsHydrating] = useState(Boolean(token));

  const clearSession = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    const responseInterceptor = apiClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error?.response?.status === 401) {
          clearSession();
        }

        return Promise.reject(error);
      },
    );

    return () => {
      apiClient.interceptors.response.eject(responseInterceptor);
    };
  }, [clearSession]);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      const storedToken = getStoredToken();

      if (!storedToken) {
        if (active) {
          setIsHydrating(false);
        }

        return;
      }

      try {
        const currentUser = await getCurrentUserRequest();

        if (!active) {
          return;
        }

        setToken(storedToken);
        setUser(currentUser);
      } catch {
        clearSession();
      } finally {
        if (active) {
          setIsHydrating(false);
        }
      }
    }

    void restoreSession();

    return () => {
      active = false;
    };
  }, [clearSession]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const result = await loginRequest(credentials);
    storeToken(result.access_token);
    setToken(result.access_token);

    try {
      const currentUser = await getCurrentUserRequest();
      setUser(currentUser);
      return currentUser;
    } catch (error) {
      clearSession();
      throw error;
    }
  }, [clearSession]);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const refreshSession = useCallback(async () => {
    const storedToken = getStoredToken();

    if (!storedToken) {
      clearSession();
      return null;
    }

    try {
      const currentUser = await getCurrentUserRequest();
      setToken(storedToken);
      setUser(currentUser);
      return currentUser;
    } catch {
      clearSession();
      return null;
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isHydrating,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
      refreshSession,
      clearSession,
    }),
    [clearSession, isHydrating, login, logout, refreshSession, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
