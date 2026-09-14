// frontend/src/mocks/fixtures.js
// Matches API_CONTRACT.md Section 14, plus prompt-000 (draft) — 
// added because Section 14's sample data omits the draft status.

export const MOCK_VOICE_MODEL = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  version_label: "v1.0",
  provider: "chatterbox",
  model_variant: "original",
  is_active: true,
  created_at: "2026-09-10T00:00:00Z"
};

export const MOCK_USERS = {
  generator: { id: 2, username: "sara",  email: "sara@agiletechstudio.com",  role: "generator" },
  approver:  { id: 3, username: "john",  email: "john@agiletechstudio.com",  role: "approver"  },
  admin:     { id: 1, username: "admin", email: "admin@agiletechstudio.com", role: "admin"     }
};

// One prompt in every possible status — covers all UI states
export const MOCK_PROMPTS = [
  {
    id: "prompt-000",
    text: "Welcome to our support line. All representatives are currently busy.",
    status: "draft",
    voice_model: null,
    audio_url: null, duration_seconds: null,
    created_by: MOCK_USERS.generator,
    approved_by: null, rejected_by: null, exported_by: null, error_detail: null,
    created_at: "2026-09-10T06:00:00Z", updated_at: "2026-09-10T06:00:00Z",
    approved_at: null, rejected_at: null, exported_at: null
  },
  {
    id: "prompt-001",
    text: "Thank you for calling Acme Support. Your call is important to us.",
    status: "approved",
    voice_model: MOCK_VOICE_MODEL,
    audio_url: "/mock-audio/sample.wav",
    duration_seconds: 3.72,
    created_by: MOCK_USERS.generator,
    approved_by: MOCK_USERS.approver,
    rejected_by: null, exported_by: null, error_detail: null,
    created_at: "2026-09-10T08:00:00Z", updated_at: "2026-09-10T09:00:00Z",
    approved_at: "2026-09-10T09:00:00Z", rejected_at: null, exported_at: null
  },
  {
    id: "prompt-002",
    text: "Please hold while we connect you to the next available agent.",
    status: "ready",
    voice_model: MOCK_VOICE_MODEL,
    audio_url: "/mock-audio/sample.wav",
    duration_seconds: 2.91,
    created_by: MOCK_USERS.generator,
    approved_by: null, rejected_by: null, exported_by: null, error_detail: null,
    created_at: "2026-09-10T09:00:00Z", updated_at: "2026-09-10T09:30:00Z",
    approved_at: null, rejected_at: null, exported_at: null
  },
  {
    id: "prompt-003",
    text: "Our offices are open Monday to Friday, 9 AM to 6 PM.",
    status: "processing",
    voice_model: MOCK_VOICE_MODEL,
    audio_url: null, duration_seconds: null,
    created_by: MOCK_USERS.generator,
    approved_by: null, rejected_by: null, exported_by: null, error_detail: null,
    created_at: "2026-09-10T10:00:00Z", updated_at: "2026-09-10T10:00:00Z",
    approved_at: null, rejected_at: null, exported_at: null
  },
  {
    id: "prompt-004",
    text: "For billing enquiries, press 2.",
    status: "rejected",
    voice_model: MOCK_VOICE_MODEL,
    audio_url: "/mock-audio/sample.wav", duration_seconds: 1.84,
    created_by: MOCK_USERS.generator,
    approved_by: null,
    rejected_by: MOCK_USERS.approver,
    exported_by: null,
    error_detail: "Pronunciation of 'billing' sounds unnatural.",
    created_at: "2026-09-09T14:00:00Z", updated_at: "2026-09-09T15:00:00Z",
    approved_at: null, rejected_at: "2026-09-09T15:00:00Z", exported_at: null
  },
  {
    id: "prompt-005",
    text: "Welcome to Acme Corp.",
    status: "live",
    voice_model: MOCK_VOICE_MODEL,
    audio_url: "/mock-audio/sample.wav", duration_seconds: 1.20,
    created_by: MOCK_USERS.generator,
    approved_by: MOCK_USERS.approver,
    rejected_by: null,
    exported_by: MOCK_USERS.admin,
    error_detail: null,
    created_at: "2026-09-08T10:00:00Z", updated_at: "2026-09-08T12:00:00Z",
    approved_at: "2026-09-08T11:00:00Z", rejected_at: null,
    exported_at: "2026-09-08T12:00:00Z"
  },
  {
    id: "prompt-006",
    text: "Your estimated wait time is 5 minutes.",
    status: "failed",
    voice_model: MOCK_VOICE_MODEL,
    audio_url: null, duration_seconds: null,
    created_by: MOCK_USERS.generator,
    approved_by: null, rejected_by: null, exported_by: null,
    error_detail: "Audio loudness out of acceptable range: -22.4 LUFS.",
    created_at: "2026-09-10T07:00:00Z", updated_at: "2026-09-10T07:01:00Z",
    approved_at: null, rejected_at: null, exported_at: null
  }
];

// Derived from MOCK_PROMPTS' approved_by/rejected_by/exported_by fields —
// one audit entry per lifecycle action already baked into the seed data.
// Section 11: GET /api/audit/ is admin-only. Field names (performed_by,
// before_status, after_status, detail, timestamp) match the real backend
// response exactly, confirmed against Yawar's live /api/audit/ data —
// this previously used actor/prompt_text/reason/created_at, which do not
// exist on the real endpoint.
export const MOCK_AUDIT_LOG = MOCK_PROMPTS.flatMap((prompt) => {
  const entries = [];

  if (prompt.approved_by) {
    entries.push({
      id: `audit-${prompt.id}-approved`,
      action: 'approved',
      performed_by: prompt.approved_by,
      prompt_id: prompt.id,
      before_status: 'ready',
      after_status: 'approved',
      detail: {},
      timestamp: prompt.approved_at
    });
  }

  if (prompt.rejected_by) {
    entries.push({
      id: `audit-${prompt.id}-rejected`,
      action: 'rejected',
      performed_by: prompt.rejected_by,
      prompt_id: prompt.id,
      before_status: 'ready',
      after_status: 'rejected',
      detail: { reason: prompt.error_detail },
      timestamp: prompt.rejected_at
    });
  }

  if (prompt.exported_by) {
    entries.push({
      id: `audit-${prompt.id}-exported`,
      action: 'exported',
      performed_by: prompt.exported_by,
      prompt_id: prompt.id,
      before_status: 'approved',
      after_status: 'live',
      detail: {},
      timestamp: prompt.exported_at
    });
  }

  return entries;
}).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

export const mockGenerateJob = (overrides = {}) => ({
  job_id: "mock-job-" + Date.now(),
  prompt_id: "prompt-new-" + Date.now(),
  status: "processing",
  audio_url: null,
  duration_seconds: null,
  error: null,
  created_at: new Date().toISOString(),
  ...overrides
});