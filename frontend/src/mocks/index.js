// frontend/src/mocks/index.js
import {
  login,
  getPrompts,
  getPromptById,
  approvePrompt,
  rejectPrompt,
  exportPrompt,
  getVoiceModels,
  generateVoice,
  getGenerationStatus,
  getAuditLog
} from './handlers';

export const mockApiClient = {
  login,
  getPrompts,
  getPromptById,
  approvePrompt,
  rejectPrompt,
  exportPrompt,
  getVoiceModels,
  generateVoice,
  getGenerationStatus,
  getAuditLog
};