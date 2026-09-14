// frontend/tests/e2e/login.spec.js
import { test, expect } from '@playwright/test';

test('successful login redirects to /generate', async ({ page }) => {
  await page.goto('/login');

  await page.getByLabel('Username').fill('sara');
  await page.getByRole('textbox', { name: 'Password' }).fill('anypassword');
  await page.getByRole('button', { name: /log in/i }).click();

  await expect(page).toHaveURL(/\/generate$/);
});

test('failed login shows an error message', async ({ page }) => {
  await page.goto('/login');

  await page.getByLabel('Username').fill('not-a-real-user');
  await page.getByRole('textbox', { name: 'Password' }).fill('wrongpassword');
  await page.getByRole('button', { name: /log in/i }).click();

  await expect(page.getByRole('alert')).toHaveText(
    /no active account found with the given credentials/i
  );
  await expect(page).toHaveURL(/\/login$/);
});

test('protected route redirects to /login when logged out', async ({ page }) => {
  await page.goto('/prompts');

  await expect(page).toHaveURL(/\/login$/);
});
