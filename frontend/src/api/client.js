// frontend/src/api/client.js
import { mockApiClient } from '../mocks/index';

const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === 'true';

// realApiClient will be added once Yawar's backend endpoints are live
export const apiClient = USE_MOCK ? mockApiClient : null;

if (!USE_MOCK && apiClient === null) {
  console.warn('VITE_USE_MOCK_API is false but no real API client is configured yet.');
}