// frontend/src/api/realClient.js
import * as tokenStore from './tokenStore';

const DJANGO_BASE_URL = import.meta.env.VITE_API_BASE_URL; // auth, prompts, voice-models (Section 8-10)
const FASTAPI_BASE_URL = import.meta.env.VITE_FASTAPI_BASE_URL; // generate, generation status (Section 9)

// Re-throws in the mock's { error, detail } envelope (Section 12) so
// existing error-handling UI keeps working unchanged against real
// responses too.
async function toApiError(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    // no JSON body — fall through to the generic envelope below
  }

  if (body && typeof body === 'object' && 'error' in body) {
    return body;
  }

  return {
    error: 'unknown_error',
    detail: body?.detail ?? `Request failed with status ${response.status}.`
  };
}

// Tracks an in-flight refresh so concurrent 401s (e.g. getPrompts +
// getVoiceModels firing together on page load) share one refresh call
// instead of each racing their own POST /api/auth/token/refresh/.
let refreshPromise = null;

async function refreshAccessToken() {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) {
    return false;
  }

  if (!refreshPromise) {
    refreshPromise = fetch(`${DJANGO_BASE_URL}/api/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken })
    })
      .then(async (response) => {
        if (!response.ok) {
          return false;
        }
        const data = await response.json();
        // Section 8: refresh response returns a new access token; refresh
        // token is only reissued if rotation is enabled, so keep the
        // existing refresh token unless a new one comes back.
        tokenStore.setTokens(data.access, data.refresh ?? refreshToken);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

async function request(baseUrl, path, { method = 'GET', body, auth = true, _retried = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };

  if (auth) {
    const accessToken = tokenStore.getAccessToken();
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const apiError = await toApiError(response);

    // Section 12: 401 token_invalid — attempt one silent refresh-and-retry
    // before surfacing the error, per the 60-minute access token expiry.
    if (response.status === 401 && apiError.error === 'token_invalid' && auth && !_retried) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return request(baseUrl, path, { method, body, auth, _retried: true });
      }
      tokenStore.clearTokens();
    }

    throw apiError;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function toQueryString(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, value);
    }
  });
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

export async function login(username, password) {
  // Section 8: POST /api/auth/token/ — no Authorization header on this call.
  const data = await request(DJANGO_BASE_URL, '/api/auth/token/', {
    method: 'POST',
    body: { username, password },
    auth: false
  });

  return { access: data.access, refresh: data.refresh };
}

export async function getPrompts(params = {}) {
  // Section 10: GET /api/prompts/ — DRF pagination envelope
  // { count, next, previous, results }. Accepts status/created_by/search/
  // ordering/page/page_size query params, same as the mock.
  return request(DJANGO_BASE_URL, `/api/prompts/${toQueryString(params)}`);
}

export async function getPromptById(id) {
  // Section 10: GET /api/prompts/{id}/ — returns a single prompt object.
  return request(DJANGO_BASE_URL, `/api/prompts/${id}/`);
}

export async function approvePrompt(id /*, role, currentUser */) {
  // Section 10: POST /api/prompts/{id}/approve/ — role/currentUser are
  // only used by the mock's client-side permission simulation; the real
  // backend enforces this server-side from the JWT, so they're accepted
  // (to keep the call signature identical for every caller) but unused.
  return request(DJANGO_BASE_URL, `/api/prompts/${id}/approve/`, {
    method: 'POST'
  });
}

export async function rejectPrompt(id, reason /*, role, currentUser */) {
  // Section 10: POST /api/prompts/{id}/reject/ — body is { reason }.
  return request(DJANGO_BASE_URL, `/api/prompts/${id}/reject/`, {
    method: 'POST',
    body: { reason }
  });
}

export async function exportPrompt(id /*, role, currentUser */) {
  // Section 10: POST /api/prompts/{id}/export/
  return request(DJANGO_BASE_URL, `/api/prompts/${id}/export/`, {
    method: 'POST'
  });
}

export async function deletePrompt(id /*, role, currentUser */) {
  // Backend: DELETE /api/prompts/{id}/delete/ — admin only, and only for
  // prompts in draft/failed/rejected status; returns 204 on success.
  // role/currentUser are accepted (unused) to keep the call signature
  // identical to approvePrompt/rejectPrompt/exportPrompt.
  return request(DJANGO_BASE_URL, `/api/prompts/${id}/delete/`, {
    method: 'DELETE'
  });
}

export async function getAuditLog(params = {}) {
  // Section 11: GET /api/audit/ — DRF pagination envelope
  // { count, next, previous, results }. Accepts action/page/page_size
  // query params, same as the mock.
  return request(DJANGO_BASE_URL, `/api/audit/${toQueryString(params)}`);
}

export async function getVoiceModels() {
  // Section 10: GET /api/voice-models/ — { count, results }.
  return request(DJANGO_BASE_URL, '/api/voice-models/');
}

export async function generateVoice(text, voiceModelId) {
  // Section 9: POST /api/generate/ (FastAPI, port 8001) — body is
  // { text, voice_model_id }, matching mock's generateVoice(text, voiceModelId).
  return request(FASTAPI_BASE_URL, '/api/generate/', {
    method: 'POST',
    body: { text, voice_model_id: voiceModelId }
  });
}

export async function getGenerationStatus(jobId) {
  // Section 9: GET /api/generate/status/{job_id}/ (FastAPI, port 8001).
  return request(FASTAPI_BASE_URL, `/api/generate/status/${jobId}/`);
}