// frontend/src/api/client.js
import { mockApiClient } from '../mocks/index';
import * as realClient from './realClient';

const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === 'true';

// Per-function override on top of realClient: every endpoint Yawar
// confirmed ready for Sync Point 2 is real. GET /api/audit/ is now live,
// so getAuditLog uses realClient too.
export const realApiClient = {
  login: realClient.login,
  getPrompts: realClient.getPrompts,
  getPromptById: realClient.getPromptById,
  approvePrompt: realClient.approvePrompt,
  rejectPrompt: realClient.rejectPrompt,
  exportPrompt: realClient.exportPrompt,
  deletePrompt: realClient.deletePrompt,
  getVoiceModels: realClient.getVoiceModels,
  uploadVoiceModel: realClient.uploadVoiceModel,
  activateVoiceModel: realClient.activateVoiceModel,
  deleteVoiceModel: realClient.deleteVoiceModel,
  generateVoice: realClient.generateVoice,
  getGenerationStatus: realClient.getGenerationStatus,
  getAuditLog: realClient.getAuditLog
};

export const apiClient = USE_MOCK ? mockApiClient : realApiClient;