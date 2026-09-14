// frontend/tests/e2e/prompt-actions.spec.js
import { test, expect } from '@playwright/test';

// Fixture prompts (src/mocks/fixtures.js) — exactly one of each status,
// so each test targets its status by unique prompt text rather than id.
const READY_PROMPT_TEXT = 'Please hold while we connect you to the next available agent.';
const APPROVED_PROMPT_TEXT = 'Thank you for calling Acme Support. Your call is important to us.';

async function loginAs(page, username) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByRole('textbox', { name: 'Password' }).fill('anypassword');
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/generate$/);
}

async function gotoPromptLibrary(page) {
  // In-app navigation, not page.goto() — auth state lives only in React
  // state (AuthContext), so a full page reload logs the user back out.
  await page.getByRole('link', { name: 'Prompt Library' }).click();
  await expect(page).toHaveURL(/\/prompts$/);
  await expect(page.locator('.prompt-card').first()).toBeVisible();
}

function cardFor(page, promptText) {
  return page.locator('.prompt-card').filter({ hasText: promptText });
}

test('generator (sara) has no approve/reject/export actions', async ({ page }) => {
  await loginAs(page, 'sara');
  await gotoPromptLibrary(page);

  const readyCard = cardFor(page, READY_PROMPT_TEXT);
  await expect(readyCard.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(readyCard.getByRole('button', { name: 'Reject' })).toHaveCount(0);

  const approvedCard = cardFor(page, APPROVED_PROMPT_TEXT);
  await expect(approvedCard.getByRole('button', { name: 'Export' })).toHaveCount(0);
});

test('approver (john) can approve a ready prompt', async ({ page }) => {
  await loginAs(page, 'john');
  await gotoPromptLibrary(page);

  const readyCard = cardFor(page, READY_PROMPT_TEXT);
  await expect(readyCard.getByRole('button', { name: 'Approve' })).toBeVisible();
  await expect(readyCard.getByRole('button', { name: 'Reject' })).toBeVisible();

  await readyCard.getByRole('button', { name: 'Approve' }).click();

  await expect(readyCard.locator('.prompt-status-badge')).toHaveText('Approved');
  await expect(readyCard.getByRole('button', { name: 'Approve' })).toHaveCount(0);
});

test('approver (john) has no export action on an approved prompt', async ({ page }) => {
  await loginAs(page, 'john');
  await gotoPromptLibrary(page);

  const approvedCard = cardFor(page, APPROVED_PROMPT_TEXT);
  await expect(approvedCard.getByRole('button', { name: 'Export' })).toHaveCount(0);
});

test('admin can export an approved prompt, which goes live with a download link', async ({ page }) => {
  await loginAs(page, 'admin');
  await gotoPromptLibrary(page);

  const approvedCard = cardFor(page, APPROVED_PROMPT_TEXT);
  await expect(approvedCard.getByRole('button', { name: 'Export' })).toBeVisible();

  await approvedCard.getByRole('button', { name: 'Export' }).click();

  await expect(approvedCard.locator('.prompt-status-badge')).toHaveText('Live');
  await expect(approvedCard.getByRole('link', { name: 'Download IVR file' })).toBeVisible();
});
