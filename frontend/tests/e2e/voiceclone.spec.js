// frontend/tests/e2e/voiceclone.spec.js
// Full product walkthrough against the live stack (Django + FastAPI + GPU
// worker). Tests run serially and share one freshly registered account.
import { test, expect } from '@playwright/test';
import {
  deductCredits,
  deleteVoiceViaApi,
  loginViaUi,
  registerViaApi,
  uniqueUser,
  uploadVoiceViaApi
} from './helpers.js';

test.describe.configure({ mode: 'serial' });

const signupUser = uniqueUser('signup');
const mainUser = uniqueUser('main');
let mainAccount = null; // { access, refresh, user }

test.beforeAll(async ({ request }) => {
  mainAccount = await registerViaApi(request, mainUser);
});

test('1. register a new user through the UI and receive 5,000 credits', async ({ page }) => {
  await page.goto('/signup');
  await expect(page.getByText('Start with 5,000 free credits')).toBeVisible();

  await page.getByLabel('Username').fill(signupUser.username);
  await page.getByLabel('Email').fill(signupUser.email);
  await page.getByLabel('Password', { exact: true }).fill(signupUser.password);
  await expect(page.getByText(/Password strength/)).toBeVisible();
  await page.getByLabel('Confirm password').fill(signupUser.password);
  await page.getByRole('button', { name: 'Create Account' }).click();

  await page.waitForURL(/\/$/);
  await expect(page.locator('.credits-value')).toContainText('5,000');
  await expect(page.locator('.credits-plan')).toContainText('Free plan');

  await page.getByTestId('avatar-button').click();
  await expect(page.getByTestId('credits-used')).toHaveText('0 / 5,000 used');
  await expect(page.getByTestId('profile-dropdown')).toContainText('Free Tier');
});

test('2. login page rejects bad credentials and accepts good ones', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(mainUser.email);
  await page.getByLabel('Password', { exact: true }).fill('definitely-wrong');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('alert')).toContainText(/no active account/i);
  await expect(page).toHaveURL(/\/login$/);

  await loginViaUi(page, mainUser);
  await expect(page.getByRole('heading', { name: 'Recents' })).toBeVisible();
  await expect(page.getByTestId('voice-picker')).toContainText(/Aria|Marcus/);
});

test('3. protected routes redirect to login when logged out', async ({ page }) => {
  await page.goto('/library');
  await expect(page).toHaveURL(/\/login$/);
});

test('4. generate speech, credits deduct, audio player and downloads appear', async ({ page }) => {
  await loginViaUi(page, mainUser);
  const script = 'Welcome to VoiceClone. This is an automated end to end check.';

  await page.getByTestId('generate-textarea').fill(script);
  await expect(page.getByTestId('char-counter')).toHaveText(`${script.length} / 5,000`);
  await page.getByTestId('generate-button').click();

  await expect(page.getByTestId('generation-result')).toBeVisible({ timeout: 150_000 });
  await expect(page.getByTestId('audio-player')).toBeVisible();
  await expect(page.getByTestId('generation-result')).toContainText(`Used ${script.length} credits`);

  // Sidebar meter and profile dropdown reflect the deduction.
  await expect(page.locator('.credits-value')).toContainText((5000 - script.length).toLocaleString('en-US'));
  await page.getByTestId('avatar-button').click();
  await expect(page.getByTestId('credits-used')).toHaveText(`${script.length} / 5,000 used`);
  await page.keyboard.press('Escape');

  // Downloads: MP3 (transcoded) and WAV (original) both trigger a browser download.
  const mp3Download = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByTestId('generation-result').getByRole('button', { name: 'MP3' }).click();
  const mp3 = await mp3Download;
  expect(mp3.suggestedFilename()).toMatch(/\.mp3$/);

  const wavDownload = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByTestId('generation-result').getByRole('button', { name: 'WAV' }).click();
  const wav = await wavDownload;
  expect(wav.suggestedFilename()).toMatch(/\.wav$/);

  // The new generation shows up in Recents.
  await expect(page.getByTestId('generation-card').first()).toContainText('Welcome to VoiceClone');
});

test('5. library shows the generation and the player modal exposes details', async ({ page }) => {
  await loginViaUi(page, mainUser);
  await page.getByRole('link', { name: 'Library' }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByTestId('generation-card').first()).toBeVisible();

  await page.getByTestId('generation-card').first().click();
  await expect(page.getByTestId('player-text')).toContainText('Welcome to VoiceClone');
  await expect(page.getByRole('dialog')).toContainText('Credits used');
  await expect(page.getByRole('button', { name: 'Download MP3' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('6. exceeding the credit balance is blocked with a clear error', async ({ page, request }) => {
  const profile = await request.get('http://localhost:8000/api/user/profile/', {
    headers: { Authorization: `Bearer ${mainAccount.access}` }
  });
  const { id, credits_remaining } = await profile.json();
  // Leave exactly 5 credits.
  const { status } = await deductCredits(request, id, credits_remaining - 5);
  expect(status).toBe(200);

  await loginViaUi(page, mainUser);
  await page.getByTestId('generate-textarea').fill('This sentence is far longer than five credits.');
  await expect(page.getByTestId('generate-error')).toContainText(/needs \d+ credits but you have 5 left/);
  await expect(page.getByTestId('generate-button')).toBeDisabled();

  // Direct API call is refused with 402 as well.
  const res = await request.post('http://localhost:8001/api/generate/', {
    headers: { Authorization: `Bearer ${mainAccount.access}` },
    data: { text: 'This sentence is far longer than five credits.', voice_model_id: 'a11a0000-0000-4000-8000-000000000001' }
  });
  expect(res.status()).toBe(402);
  expect((await res.json()).detail.error).toBe('insufficient_credits');
});

test('7. voices page enforces the 3-voice limit on the free tier', async ({ page, request }) => {
  const token = mainAccount.access;
  await loginViaUi(page, mainUser);
  await page.getByRole('link', { name: 'Voices' }).click();
  await expect(page.getByRole('heading', { name: 'My Voices' })).toBeVisible();
  await expect(page.getByTestId('voices-usage')).toHaveText('0 / 3 voices used');
  await expect(page.getByTestId('voice-card')).toHaveCount(2); // Aria + Marcus
  await expect(page.getByText('Aria — Professional Female')).toBeVisible();
  await expect(page.getByText('Marcus — Professional Male')).toBeVisible();

  // Upload through the UI once (drag-and-drop zone + 2-step modal).
  await page.getByTestId('add-voice-card').click();
  await expect(page.getByRole('dialog', { name: 'Add Voice Clone' })).toBeVisible();
  await page.getByTestId('voice-file-input').setInputFiles('../voice_assets/defaults/aria.wav');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Voice name').fill('E2E Clone One');
  await page.getByRole('button', { name: 'Upload voice' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByTestId('voices-usage')).toHaveText('1 / 3 voices used');
  await expect(page.getByText('E2E Clone One')).toBeVisible();

  // Fill the remaining slots via the API, then the UI must refuse a 4th.
  const uploaded = [];
  for (const name of ['E2E Clone Two', 'E2E Clone Three']) {
    const { status, body } = await uploadVoiceViaApi(request, token, name);
    expect(status).toBe(202);
    uploaded.push(body.id);
  }
  const fourth = await uploadVoiceViaApi(request, token, 'E2E Clone Four');
  expect(fourth.status).toBe(403);
  expect(fourth.body.error).toBe('voice_limit_reached');

  await page.reload();
  await expect(page.getByTestId('voices-usage')).toHaveText('3 / 3 voices used');
  await page.getByTestId('add-voice-button').click();
  await expect(page.locator('.toast')).toContainText('Upgrade your plan');

  // Cleanup: delete the API-uploaded clones (wait for processing to finish first).
  await expect
    .poll(
      async () => {
        const res = await request.get('http://localhost:8000/api/voice-models/', { headers: { Authorization: `Bearer ${token}` } });
        const { results } = await res.json();
        return results.filter((v) => !v.is_default && v.status === 'processing').length;
      },
      { timeout: 120_000, intervals: [3000] }
    )
    .toBe(0);
  for (const id of uploaded) await deleteVoiceViaApi(request, token, id);
});

test('8. command palette opens with Ctrl+K and lists quick actions + recents', async ({ page }) => {
  await loginViaUi(page, mainUser);
  await page.keyboard.press('Control+K');
  const palette = page.getByTestId('command-palette');
  await expect(palette).toBeVisible();
  await expect(palette.getByText('Create a voice', { exact: true })).toBeVisible();
  await expect(palette.getByText('Generate speech', { exact: true })).toBeVisible();
  await expect(palette).toContainText('Welcome to VoiceClone');

  await page.getByPlaceholder('Search actions, voices, music, assets...').fill('create');
  await expect(palette.getByText('Create a voice', { exact: true })).toBeVisible();
  await expect(palette.getByText('Generate speech', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('command-palette')).toHaveCount(0);

  // Search pill in the top bar opens it too.
  await page.getByRole('button', { name: 'Search everything' }).click();
  await expect(page.getByTestId('command-palette')).toBeVisible();
});

test('9. feedback modal, sidebar collapse and profile settings work', async ({ page }) => {
  await loginViaUi(page, mainUser);

  await page.getByRole('button', { name: 'Feedback' }).click();
  await expect(page.getByRole('dialog', { name: 'Send Feedback' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Feedback' }).fill('Love the orbs.');
  await page.getByRole('button', { name: 'Send Feedback' }).click();
  await expect(page.locator('.toast')).toContainText('Thanks for your feedback');

  const sidebar = page.locator('.sidebar');
  await expect(sidebar).toHaveCSS('width', '240px');
  await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  await expect(sidebar).toHaveCSS('width', '0px');
  await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  await expect(sidebar).toHaveCSS('width', '240px');

  await page.getByTestId('avatar-button').click();
  await page.getByRole('menuitem', { name: 'Profile Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Profile Settings' })).toBeVisible();
  await expect(page.getByText('Current plan')).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('10. deleting a generation from the player modal removes it from the library', async ({ page }) => {
  await loginViaUi(page, mainUser);
  await page.goto('/library');
  const cards = page.getByTestId('generation-card');
  await expect(cards.first()).toBeVisible();
  const before = await cards.count();

  await cards.first().click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(page.locator('.toast')).toContainText('Generation deleted');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  if (before === 1) {
    await expect(page.getByText('Your library is empty')).toBeVisible();
  } else {
    await expect(cards).toHaveCount(before - 1);
  }
});
