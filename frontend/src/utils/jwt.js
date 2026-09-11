// frontend/src/utils/jwt.js
// Decodes the payload of a JWT (base64url) without verifying the signature.
// Client-side role gating only — Section 6: Ahtesham reads payload.role
// directly instead of round-tripping to /api/me/.

function base64UrlDecode(segment) {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
  return atob(padded);
}

export function decodeToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}

export function isTokenExpired(token) {
  const payload = decodeToken(token);
  if (!payload || typeof payload.exp !== 'number') {
    return true;
  }
  return Date.now() >= payload.exp * 1000;
}
