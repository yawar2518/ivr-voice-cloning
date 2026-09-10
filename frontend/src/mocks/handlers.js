// frontend/src/mocks/handlers.js
import { MOCK_PROMPTS, MOCK_USERS } from './fixtures';
const MOCK_DELAY_MS = 500;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
export async function approvePrompt(id, currentUserRole) {
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
  prompt.approved_by = MOCK_USERS.approver; // TODO: use actual logged-in user
  prompt.approved_at = new Date().toISOString();

  return {
    id: prompt.id,
    status: prompt.status,
    approved_by: prompt.approved_by,
    approved_at: prompt.approved_at
  };
}
export async function rejectPrompt(id, reason, currentUserRole) {
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
  prompt.rejected_by = MOCK_USERS.approver; // TODO: use actual logged-in user
  prompt.rejected_at = new Date().toISOString();
  prompt.error_detail = reason;

  return {
    id: prompt.id,
    status: prompt.status,
    rejected_by: prompt.rejected_by,
    rejected_at: prompt.rejected_at,
    error_detail: prompt.error_detail
  };
}
