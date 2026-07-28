import { useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    const responseInterceptor = apiClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error?.response?.status === 401) {
          clearStoredToken();
          setToken(null);
          setUser(null);
        }

        return Promise.reject(error);
      },
    );

    return () => {
      apiClient.interceptors.response.eject(responseInterceptor);
    };
  }, []);

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
        clearStoredToken();

        if (active) {
          setToken(null);
          setUser(null);
        }
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
  }, []);

  async function login(credentials: LoginCredentials) {
    const result = await loginRequest(credentials);
    storeToken(result.access_token);
    setToken(result.access_token);

    try {
      const currentUser = await getCurrentUserRequest();
      setUser(currentUser);
      return currentUser;
    } catch (error) {
      clearStoredToken();
      setToken(null);
      setUser(null);
      throw error;
    }
  }

  async function logout() {
    try {
      await logoutRequest();
    } finally {
      clearStoredToken();
      setToken(null);
      setUser(null);
    }
  }

  async function refreshSession() {
    const storedToken = getStoredToken();

    if (!storedToken) {
      clearStoredToken();
      setToken(null);
      setUser(null);
      return null;
    }

    try {
      const currentUser = await getCurrentUserRequest();
      setToken(storedToken);
      setUser(currentUser);
      return currentUser;
    } catch {
      clearStoredToken();
      setToken(null);
      setUser(null);
      return null;
    }
  }

  function clearSession() {
    clearStoredToken();
    setToken(null);
    setUser(null);
  }

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
    [isHydrating, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
