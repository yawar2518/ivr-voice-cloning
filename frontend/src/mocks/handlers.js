// frontend/src/mocks/handlers.js
import { MOCK_AUDIT_LOG, MOCK_PROMPTS, MOCK_USERS, MOCK_VOICE_MODEL } from './fixtures';
const MOCK_DELAY_MS = 500;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Live approve/reject/export calls append here so the in-memory audit
// log reflects actions taken during the session, not just seed data.
const sessionAuditLog = [];

function recordAuditEntry(action, prompt, actor, reason = null) {
  sessionAuditLog.unshift({
    id: `audit-${prompt.id}-${action}-${Date.now()}`,
    action,
    actor,
    prompt_id: prompt.id,
    prompt_text: prompt.text,
    reason,
    created_at: new Date().toISOString()
  });
}

// In-memory store linking generateVoice() job_ids to their start time,
// so getGenerationStatus() can simulate the 3-second resolve delay
// documented in contract Section 14.
const activeJobs = {};

function base64UrlEncode(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Fakes a JWT shape (header.payload.signature) matching Section 6's exact
// payload structure, so decodeToken() in src/utils/jwt.js works identically
// against mock and real tokens. Signature segment is not cryptographically
// meaningful — the mock never verifies it.
function encodeMockJwt(user, tokenType, ttlSeconds) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const nowSeconds = Math.floor(Date.now() / 1000);

  const payload = {
    token_type: tokenType,
    exp: nowSeconds + ttlSeconds,
    iat: nowSeconds,
    jti: `mock-jti-${Math.random().toString(36).slice(2)}`,
    user_id: user.id,
    username: user.username,
    email: user.email,
    role: user.role
  };

  return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.mock-signature`;
}

export async function getPrompts(params = {}) {
  await delay(MOCK_DELAY_MS);

  let results = [...MOCK_PROMPTS];

  if (params.status) {
    results = results.filter((p) => p.status === params.status);
  }

  if (params.created_by) {
    results = results.filter((p) => p.created_by.id === Number(params.created_by));
  }

  if (params.search) {
    const query = params.search.toLowerCase();
    results = results.filter((p) => p.text.toLowerCase().includes(query));
  }

  if (params.ordering) {
    const desc = params.ordering.startsWith('-');
    const field = desc ? params.ordering.slice(1) : params.ordering;
    results.sort((a, b) => {
      if (a[field] < b[field]) return desc ? 1 : -1;
      if (a[field] > b[field]) return desc ? -1 : 1;
      return 0;
    });
  }

  const page = params.page || 1;
  const pageSize = params.page_size || 20;
  const start = (page - 1) * pageSize;
  const paginated = results.slice(start, start + pageSize);

  return {
    count: results.length,
    next: start + pageSize < results.length ? `http://localhost:8000/api/prompts/?page=${page + 1}` : null,
    previous: page > 1 ? `http://localhost:8000/api/prompts/?page=${page - 1}` : null,
    results: paginated
  };
}

export async function getPromptById(id) {
  await delay(MOCK_DELAY_MS);

  const prompt = MOCK_PROMPTS.find((p) => p.id === id);

  if (!prompt) {
    throw {
      error: 'not_found',
      detail: 'No voice prompt found with this ID.'
    };
  }

  return prompt;
}

export async function approvePrompt(id, currentUserRole, currentUser) {
  await delay(MOCK_DELAY_MS);

  const prompt = MOCK_PROMPTS.find((p) => p.id === id);

  if (!prompt) {
    throw { error: 'not_found', detail: 'No voice prompt found with this ID.' };
  }

  if (currentUserRole !== 'approver' && currentUserRole !== 'admin') {
    throw { error: 'permission_denied', detail: 'Only approvers and admins can approve prompts.' };
  }

  if (prompt.status !== 'ready') {
    throw {
      error: 'invalid_transition',
      detail: `Cannot approve a prompt with status '${prompt.status}'. Prompt must be 'ready'.`
    };
  }

  prompt.status = 'approved';
  prompt.approved_by = currentUser;
  prompt.approved_at = new Date().toISOString();
  recordAuditEntry('approved', prompt, currentUser);

  return {
    id: prompt.id,
    status: prompt.status,
    approved_by: prompt.approved_by,
    approved_at: prompt.approved_at
  };
}

export async function rejectPrompt(id, reason, currentUserRole, currentUser) {
  await delay(MOCK_DELAY_MS);

  const prompt = MOCK_PROMPTS.find((p) => p.id === id);

  if (!prompt) {
    throw { error: 'not_found', detail: 'No voice prompt found with this ID.' };
  }

  if (currentUserRole !== 'approver' && currentUserRole !== 'admin') {
    throw { error: 'permission_denied', detail: 'Only approvers and admins can approve prompts.' };
  }

  if (!reason || reason.trim() === '') {
    throw { error: 'validation_error', detail: { reason: ['This field is required.'] } };
  }

  if (prompt.status !== 'ready') {
    throw {
      error: 'invalid_transition',
      detail: `Cannot reject a prompt with status '${prompt.status}'. Prompt must be 'ready'.`
    };
  }

  prompt.status = 'rejected';
  prompt.rejected_by = currentUser;
  prompt.rejected_at = new Date().toISOString();
  prompt.error_detail = reason;
  recordAuditEntry('rejected', prompt, currentUser, reason);

  return {
    id: prompt.id,
    status: prompt.status,
    rejected_by: prompt.rejected_by,
    rejected_at: prompt.rejected_at,
    error_detail: prompt.error_detail
  };
}

export async function login(username, password) {
  await delay(MOCK_DELAY_MS);

  const user = Object.values(MOCK_USERS).find((u) => u.username === username);

  if (!user || !password) {
    throw {
      error: 'authentication_failed',
      detail: 'No active account found with the given credentials.'
    };
  }

  return {
    access: encodeMockJwt(user, 'access', 60 * 60),
    refresh: encodeMockJwt(user, 'refresh', 60 * 60 * 24 * 7)
  };
}

export async function exportPrompt(id, currentUserRole, currentUser) {
  await delay(MOCK_DELAY_MS);

  const prompt = MOCK_PROMPTS.find((p) => p.id === id);

  if (!prompt) {
    throw { error: 'not_found', detail: 'No voice prompt found with this ID.' };
  }

  if (currentUserRole !== 'admin') {
    throw { error: 'permission_denied', detail: 'Only admins can export prompts.' };
  }

  if (prompt.status !== 'approved') {
    throw {
      error: 'invalid_transition',
      detail: `Cannot export a prompt with status '${prompt.status}'. Prompt must be 'approved'.`
    };
  }

  prompt.status = 'live';
  prompt.exported_by = currentUser;
  prompt.exported_at = new Date().toISOString();
  recordAuditEntry('exported', prompt, currentUser);

  return {
    id: prompt.id,
    status: prompt.status,
    exported_by: prompt.exported_by,
    exported_at: prompt.exported_at,
    export_download_url: `/mock-audio/sample.wav` // stand-in for real export_8khz_pcm.wav
  };
}

export async function getAuditLog(params = {}) {
  await delay(MOCK_DELAY_MS);

  let results = [...sessionAuditLog, ...MOCK_AUDIT_LOG];

  if (params.action) {
    results = results.filter((entry) => entry.action === params.action);
  }

  const page = params.page || 1;
  const pageSize = params.page_size || 20;
  const start = (page - 1) * pageSize;
  const paginated = results.slice(start, start + pageSize);

  return {
    count: results.length,
    next: start + pageSize < results.length ? `http://localhost:8000/api/audit/?page=${page + 1}` : null,
    previous: page > 1 ? `http://localhost:8000/api/audit/?page=${page - 1}` : null,
    results: paginated
  };
}

export async function getVoiceModels() {
  await delay(MOCK_DELAY_MS);

  return {
    count: 1,
    results: [MOCK_VOICE_MODEL]
  };
}

export async function generateVoice(text, voiceModelId) {
  await delay(MOCK_DELAY_MS);

  const errors = {};
  if (!text || text.trim() === '') {
    errors.text = ['This field may not be blank.'];
  } else if (text.length > 500) {
    errors.text = ['Ensure this value has at most 500 characters.'];
  }
  if (!voiceModelId) {
    errors.voice_model_id = ['This field is required.'];
  }

  if (Object.keys(errors).length > 0) {
    throw { error: 'validation_error', detail: errors };
  }

  const jobId = `mock-job-${Date.now()}`;
  const promptId = `mock-prompt-${Date.now()}`;

  activeJobs[jobId] = {
    promptId,
    startTime: Date.now(),
    text
  };

  return {
    job_id: jobId,
    prompt_id: promptId,
    status: 'processing',
    created_at: new Date().toISOString()
  };
}

export async function getGenerationStatus(jobId) {
  await delay(MOCK_DELAY_MS);

  const job = activeJobs[jobId];

  if (!job) {
    throw { error: 'not_found', detail: 'No generation job found with this ID.' };
  }

  const elapsed = Date.now() - job.startTime;
  const RESOLVE_AFTER_MS = 3000;

  if (elapsed < RESOLVE_AFTER_MS) {
    return {
      job_id: jobId,
      prompt_id: job.promptId,
      status: 'processing',
      audio_url: null,
      duration_seconds: null,
      error: null
    };
  }

  const shouldFail = import.meta.env.VITE_MOCK_FAIL_GENERATION === 'true';

  if (shouldFail) {
    return {
      job_id: jobId,
      prompt_id: job.promptId,
      status: 'failed',
      audio_url: null,
      duration_seconds: null,
      error: 'Audio loudness out of acceptable range: -22.4 LUFS.'
    };
  }

  return {
    job_id: jobId,
    prompt_id: job.promptId,
    status: 'ready',
    audio_url: '/mock-audio/sample.wav',
    duration_seconds: 3.72,
    error: null
  };
}