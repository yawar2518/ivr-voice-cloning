// frontend/src/context/AuthContext.jsx
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { apiClient } from '../api/client';
import { decodeToken, isTokenExpired } from '../utils/jwt';
import * as tokenStore from '../api/tokenStore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(tokenStore.getAccessToken());
  const [refreshToken, setRefreshToken] = useState(tokenStore.getRefreshToken());

  // realApiClient can refresh tokens on its own (401 → refresh → retry);
  // this keeps AuthContext's state in sync with tokenStore either way.
  useEffect(() => {
    return tokenStore.subscribe((nextAccess, nextRefresh) => {
      setAccessToken(nextAccess);
      setRefreshToken(nextRefresh);
    });
  }, []);

  const login = useCallback(async (username, password) => {
    const { access, refresh } = await apiClient.login(username, password);
    tokenStore.setTokens(access, refresh);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clearTokens();
  }, []);

  const payload = decodeToken(accessToken);
  const isAuthenticated = Boolean(payload) && !isTokenExpired(accessToken);

  const value = {
    accessToken,
    refreshToken,
    isAuthenticated,
    userId: payload?.user_id ?? null,
    role: payload?.role ?? null,
    username: payload?.username ?? null,
    email: payload?.email ?? null,
    login,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
