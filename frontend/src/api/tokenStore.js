// frontend/src/api/tokenStore.js
// Plain module-level store for the current JWT pair. realApiClient (a plain
// module, not a React component) needs to read the access token on every
// request and write new tokens back after a silent refresh — neither of
// which it can do if the tokens only exist as AuthContext's useState.
// AuthContext wraps this store to stay the single source of truth other
// components read from via useAuth().

let accessToken = null;
let refreshToken = null;
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
  listeners.forEach((listener) => listener(accessToken, refreshToken));
}

export function clearTokens() {
  setTokens(null, null);
}

// Lets AuthContext re-render when realApiClient refreshes tokens out from
// under it (e.g. after a 401 → refresh → retry cycle).
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
