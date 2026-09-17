// frontend/tests/e2e/helpers.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DJANGO = process.env.E2E_API_URL ?? 'http://localhost:8000';
export const FASTAPI = process.env.E2E_FASTAPI_URL ?? 'http://localhost:8001';
export const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN ?? 'dev-internal-token-change-me';
export const PASSWORD = 'Str0ngPassw0rd!';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SAMPLE_WAV = path.resolve(here, '../../../voice_assets/defaults/aria.wav');

export function uniqueUser(prefix = 'e2e') {
  const suffix = Math.random().toString(36).slice(2, 8);
  return { username: `${prefix}_${suffix}`, email: `${prefix}_${suffix}@example.com`, password: PASSWORD };
}

export async function registerViaApi(request, user) {
  const res = await request.post(`${DJANGO}/api/auth/register/`, {
    data: { username: user.username, email: user.email, password: user.password, confirm_password: user.password }
  });
  if (!res.ok()) throw new Error(`register failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

export async function deductCredits(request, userId, amount) {
  const res = await request.patch(`${DJANGO}/api/user/credits/deduct/`, {
    headers: { 'X-Internal-Token': INTERNAL_TOKEN },
    data: { user_id: userId, amount }
  });
  return { status: res.status(), body: await res.json() };
}

export async function uploadVoiceViaApi(request, token, name) {
  const res = await request.post(`${DJANGO}/api/voice-models/upload/`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      display_name: name,
      language: 'english',
      audio_file: { name: 'clip.wav', mimeType: 'audio/wav', buffer: fs.readFileSync(SAMPLE_WAV) }
    }
  });
  return { status: res.status(), body: await res.json() };
}

export async function deleteVoiceViaApi(request, token, id) {
  await request.delete(`${DJANGO}/api/voice-models/${id}/`, { headers: { Authorization: `Bearer ${token}` } });
}

export async function loginViaUi(page, user) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL(/\/$/);
}
