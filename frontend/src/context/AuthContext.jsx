// frontend/src/context/AuthContext.jsx
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import * as tokenStore from '../api/tokenStore';
import { decodeToken, isTokenExpired } from '../utils/jwt';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(tokenStore.getAccessToken());
  const [user, setUser] = useState(null);
  const [isLoadingUser, setIsLoadingUser] = useState(false);

  useEffect(() => {
    return tokenStore.subscribe((nextAccess) => {
      setAccessToken(nextAccess);
      if (!nextAccess) setUser(null);
    });
  }, []);

  const payload = decodeToken(accessToken);
  const hasRefresh = Boolean(tokenStore.getRefreshToken());
  // A stale access token is fine as long as we can refresh it; the API
  // client refreshes transparently on the first 401.
  const isAuthenticated = Boolean(payload) && (!isTokenExpired(accessToken) || hasRefresh);

  const refreshProfile = useCallback(async () => {
    if (!tokenStore.getAccessToken()) return null;
    setIsLoadingUser(true);
    try {
      const profile = await apiClient.getProfile();
      setUser(profile);
      return profile;
    } catch (err) {
      if (err?.status === 401) tokenStore.clearTokens();
      return null;
    } finally {
      setIsLoadingUser(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && !user) {
      refreshProfile();
    }
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (identifier, password) => {
    const { access, refresh } = await apiClient.login(identifier, password);
    // Setting tokens flips isAuthenticated synchronously; the effect above
    // loads the profile. Nothing else may navigate after this point, or a
    // late redirect can undo the user's first click on the dashboard.
    tokenStore.setTokens(access, refresh);
  }, []);

  const register = useCallback(async (form) => {
    const data = await apiClient.register(form);
    tokenStore.setTokens(data.access, data.refresh);
    setUser(data.user);
    return data.user;
  }, []);

  const updateProfile = useCallback(async (patch) => {
    const profile = await apiClient.updateProfile(patch);
    setUser(profile);
    return profile;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clearTokens();
    setUser(null);
  }, []);

  // Optimistic local adjustment right after a generation is accepted, so the
  // sidebar meter moves instantly; refreshProfile() reconciles afterwards.
  const applyCreditCharge = useCallback((amount) => {
    setUser((prev) => {
      if (!prev) return prev;
      const used = prev.credits_used + amount;
      return { ...prev, credits_used: used, credits_remaining: Math.max(0, prev.credits_limit - used) };
    });
  }, []);

  const value = {
    accessToken,
    isAuthenticated,
    isLoadingUser,
    user,
    userId: user?.id ?? payload?.user_id ?? null,
    username: user?.username ?? payload?.username ?? null,
    email: user?.email ?? payload?.email ?? null,
    tier: user?.tier ?? payload?.tier ?? 'free',
    login,
    register,
    logout,
    refreshProfile,
    updateProfile,
    applyCreditCharge
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
