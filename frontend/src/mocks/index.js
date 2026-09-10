// frontend/src/mocks/index.js
import { getPrompts, getPromptById, approvePrompt, rejectPrompt, exportPrompt } from './handlers';

export const mockApiClient = {
  getPrompts,
  getPromptById,
  approvePrompt,
  rejectPrompt,
  exportPrompt
};