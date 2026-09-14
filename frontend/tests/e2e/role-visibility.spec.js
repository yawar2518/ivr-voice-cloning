// frontend/tests/e2e/role-visibility.spec.js
import { test, expect } from '@playwright/test';

async function loginAs(page, username) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByRole('textbox', { name: 'Password' }).fill('anypassword');
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/generate$/);
}

test('generator (sara) sees Generate and Prompt Library, not Audit Log', async ({ page }) => {
  await loginAs(page, 'sara');

  await expect(page.getByRole('link', { name: 'Generate' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Prompt Library' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Audit Log' })).toHaveCount(0);
});

test('approver (john) sees Generate and Prompt Library, not Audit Log', async ({ page }) => {
  await loginAs(page, 'john');

  await expect(page.getByRole('link', { name: 'Generate' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Prompt Library' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Audit Log' })).toHaveCount(0);
});

test('admin sees Generate, Prompt Library, and Audit Log', async ({ page }) => {
  await loginAs(page, 'admin');

  await expect(page.getByRole('link', { name: 'Generate' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Prompt Library' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Audit Log' })).toBeVisible();
});
