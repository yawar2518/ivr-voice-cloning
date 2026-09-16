// frontend/src/api/client.js
import * as realClient from './realClient';

export const apiClient = {
  login: realClient.login,
  register: realClient.register,
  getProfile: realClient.getProfile,
  updateProfile: realClient.updateProfile,
  getVoiceModels: realClient.getVoiceModels,
  getVoiceModel: realClient.getVoiceModel,
  uploadVoiceModel: realClient.uploadVoiceModel,
  activateVoiceModel: realClient.activateVoiceModel,
  deleteVoiceModel: realClient.deleteVoiceModel,
  generateVoice: realClient.generateVoice,
  getGenerationStatus: realClient.getGenerationStatus,
  getGenerations: realClient.getGenerations,
  getGeneration: realClient.getGeneration,
  deleteGeneration: realClient.deleteGeneration,
  getDownloadUrl: realClient.getDownloadUrl
};
