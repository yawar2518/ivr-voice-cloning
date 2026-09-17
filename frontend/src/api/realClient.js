// frontend/src/api/realClient.js
import * as tokenStore from './tokenStore';

const DJANGO_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const FASTAPI_BASE_URL = import.meta.env.VITE_FASTAPI_BASE_URL ?? 'http://localhost:8001';

// Every error surfaces as { error, detail, status }. Django views return
// that envelope directly; FastAPI wraps it one level down in `detail`.
async function toApiError(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    // no JSON body
  }

  const status = response.status;

  if (body && typeof body === 'object') {
    if ('error' in body) return { ...body, status };
    if (body.detail && typeof body.detail === 'object' && 'error' in body.detail) {
      return { ...body.detail, status };
    }
    if (typeof body.detail === 'string') {
      const error = status === 401 ? 'token_invalid' : 'request_failed';
      return { error, detail: body.detail, status };
    }
    if (Array.isArray(body.detail)) {
      // FastAPI / pydantic validation errors
      return {
        error: 'validation_error',
        detail: body.detail.map((d) => d.msg).join(' '),
        status
      };
    }
  }

  return {
    error: status === 401 ? 'token_invalid' : 'unknown_error',
    detail: `Request failed with status ${status}.`,
    status
  };
}

let refreshPromise = null;

async function refreshAccessToken() {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return false;

  if (!refreshPromise) {
    refreshPromise = fetch(`${DJANGO_BASE_URL}/api/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken })
    })
      .then(async (response) => {
        if (!response.ok) return false;
        const data = await response.json();
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
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  }

  const init = { method, headers };
  if (body !== undefined && method !== 'GET') init.body = JSON.stringify(body);
  const response = await fetch(`${baseUrl}${path}`, init);

  if (!response.ok) {
    const apiError = await toApiError(response);

    if (response.status === 401 && auth && !_retried) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return request(baseUrl, path, { method, body, auth, _retried: true });
      }
      tokenStore.clearTokens();
    }

    throw apiError;
  }

  if (response.status === 204) return null;
  return response.json();
}

// Multipart upload via XHR so we can report progress.
function requestMultipart(baseUrl, path, formData, { onProgress, _retried = false } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${baseUrl}${path}`);
    const accessToken = tokenStore.getAccessToken();
    if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };
    }

    xhr.onerror = () => reject({ error: 'network_error', detail: 'Upload failed. Check your connection.' });
    xhr.onload = async () => {
      const status = xhr.status;
      let body = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }

      if (status >= 200 && status < 300) {
        resolve(body);
        return;
      }

      if (status === 401 && !_retried) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          resolve(requestMultipart(baseUrl, path, formData, { onProgress, _retried: true }));
          return;
        }
        tokenStore.clearTokens();
      }

      if (body && typeof body === 'object' && 'error' in body) {
        reject({ ...body, status });
      } else {
        reject({ error: 'unknown_error', detail: `Upload failed with status ${status}.`, status });
      }
    };

    xhr.send(formData);
  });
}

function toQueryString(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  });
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

// ─── Auth ──────────────────────────────────────────────────────────────────

export async function login(identifier, password) {
  const data = await request(DJANGO_BASE_URL, '/api/auth/token/', {
    method: 'POST',
    body: { username: identifier, password },
    auth: false
  });
  return { access: data.access, refresh: data.refresh };
}

export async function register({ username, email, password, confirmPassword }) {
  return request(DJANGO_BASE_URL, '/api/auth/register/', {
    method: 'POST',
    body: { username, email, password, confirm_password: confirmPassword },
    auth: false
  });
}

// ─── Profile ───────────────────────────────────────────────────────────────

export async function getProfile() {
  return request(DJANGO_BASE_URL, '/api/user/profile/');
}

export async function updateProfile(patch) {
  return request(DJANGO_BASE_URL, '/api/user/profile/', { method: 'PATCH', body: patch });
}

// ─── Voices ────────────────────────────────────────────────────────────────

export async function getVoiceModels() {
  return request(DJANGO_BASE_URL, '/api/voice-models/');
}

export async function getVoiceModel(id) {
  return request(DJANGO_BASE_URL, `/api/voice-models/${id}/`);
}

export async function uploadVoiceModel(formData, options = {}) {
  return requestMultipart(DJANGO_BASE_URL, '/api/voice-models/upload/', formData, options);
}

export async function activateVoiceModel(id) {
  return request(DJANGO_BASE_URL, `/api/voice-models/${id}/activate/`, { method: 'POST' });
}

export async function deleteVoiceModel(id) {
  return request(DJANGO_BASE_URL, `/api/voice-models/${id}/`, { method: 'DELETE' });
}

// ─── Generation ────────────────────────────────────────────────────────────

export async function generateVoice(text, voiceModelId) {
  return request(FASTAPI_BASE_URL, '/api/generate/', {
    method: 'POST',
    body: { text, voice_model_id: voiceModelId }
  });
}

export async function getGenerationStatus(jobId) {
  return request(FASTAPI_BASE_URL, `/api/generate/status/${jobId}/`);
}

// ─── History ───────────────────────────────────────────────────────────────

export async function getGenerations(params = {}) {
  return request(DJANGO_BASE_URL, `/api/prompts/${toQueryString(params)}`);
}

export async function getGeneration(id) {
  return request(DJANGO_BASE_URL, `/api/prompts/${id}/`);
}

export async function deleteGeneration(id) {
  return request(DJANGO_BASE_URL, `/api/prompts/${id}/delete/`, { method: 'DELETE' });
}

export async function getDownloadUrl(id, format = 'mp3') {
  return request(DJANGO_BASE_URL, `/api/prompts/${id}/download/?format=${format}&as=json`);
}
