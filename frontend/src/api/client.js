// frontend/src/api/client.js
import { mockApiClient } from '../mocks/index';
import * as realClient from './realClient';

const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === 'true';

// Per-function override on top of realClient: every endpoint Yawar
// confirmed ready for Sync Point 2 is real. getAuditLog stays on the mock
// for now — GET /api/audit/ was not in his ready list and would break
// against the live backend; switch it once that endpoint is confirmed live.
export const realApiClient = {
  login: realClient.login,
  getPrompts: realClient.getPrompts,
  getPromptById: realClient.getPromptById,
  approvePrompt: realClient.approvePrompt,
  rejectPrompt: realClient.rejectPrompt,
  exportPrompt: realClient.exportPrompt,
  getVoiceModels: realClient.getVoiceModels,
  generateVoice: realClient.generateVoice,
  getGenerationStatus: realClient.getGenerationStatus,
  getAuditLog: mockApiClient.getAuditLog
};

export const apiClient = USE_MOCK ? mockApiClient : realApiClient;