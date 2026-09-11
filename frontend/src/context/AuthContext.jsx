// frontend/src/context/AuthContext.jsx
import { createContext, useContext, useState, useCallback } from 'react';
import { apiClient } from '../api/client';
import { decodeToken, isTokenExpired } from '../utils/jwt';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);

  const login = useCallback(async (username, password) => {
    const { access, refresh } = await apiClient.login(username, password);
    setAccessToken(access);
    setRefreshToken(refresh);
  }, []);

  const logout = useCallback(() => {
    setAccessToken(null);
    setRefreshToken(null);
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
