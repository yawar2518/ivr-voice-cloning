// frontend/tests/e2e/generate-flow.spec.js
import { test, expect } from '@playwright/test';

// Mock generateVoice() resolves to "ready" ~3s after submission (contract
// Section 14's RESOLVE_AFTER_MS), and useGenerateJob polls every 2s — so
// give the "ready" assertion enough headroom past worst-case poll timing.
const READY_TIMEOUT_MS = 15000;

async function loginAs(page, username) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByRole('textbox', { name: 'Password' }).fill('anypassword');
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/generate$/);
}

test('typing text, generating, and reaching the ready state with audio playback', async ({ page }) => {
  await loginAs(page, 'sara');

  const textarea = page.locator('#generate-text');
  const generateBtn = page.getByRole('button', { name: 'Generate' });

  // Voice models load async; wait for the button to become enabled rather
  // than racing it.
  const sampleText = 'Thank you for calling. Please hold for the next available agent.';
  await textarea.fill(sampleText);

  await expect(page.locator('.generate-chip').filter({ hasText: '/ 500' })).toHaveText(
    `${sampleText.length} / 500`
  );

  await expect(generateBtn).toBeEnabled();
  await generateBtn.click();

  await expect(page.locator('.generate-job-status-processing')).toBeVisible();
  await expect(page.getByText(/status: processing/)).toBeVisible();

  await expect(page.getByText(/status: ready/)).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await expect(page.locator('.audio-player')).toBeVisible();
});

test('text over 500 characters disables the Generate button', async ({ page }) => {
  await loginAs(page, 'sara');

  const textarea = page.locator('#generate-text');
  const generateBtn = page.getByRole('button', { name: 'Generate' });

  const overLimitText = 'a'.repeat(501);
  await textarea.fill(overLimitText);

  await expect(page.locator('.generate-chip').filter({ hasText: '/ 500' })).toHaveText('501 / 500');
  await expect(textarea).toHaveClass(/generate-textarea-error/);
  await expect(generateBtn).toBeDisabled();
});
