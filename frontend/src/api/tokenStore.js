// frontend/src/api/tokenStore.js
// Module-level JWT store with localStorage persistence, so a page refresh
// keeps the session. realClient reads/writes here directly (it is not a
// React component); AuthContext subscribes to stay in sync.

const STORAGE_KEY = 'voiceclone.auth';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { access: null, refresh: null };
    const parsed = JSON.parse(raw);
    return { access: parsed.access ?? null, refresh: parsed.refresh ?? null };
  } catch {
    return { access: null, refresh: null };
  }
}

function persist(access, refresh) {
  try {
    if (!access && !refresh) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ access, refresh }));
    }
  } catch {
    // storage unavailable (private mode) — in-memory tokens still work
  }
}

let { access: accessToken, refresh: refreshToken } = load();
const listeners = new Set();

export function getAccessToken() {
  return accessToken;
}

export function getRefreshToken() {
  return refreshToken;
}

export function setTokens(nextAccess, nextRefresh) {
  accessToken = nextAccess;
  refreshToken = nextRefresh;
  persist(accessToken, refreshToken);
  listeners.forEach((listener) => listener(accessToken, refreshToken));
}

export function clearTokens() {
  setTokens(null, null);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
