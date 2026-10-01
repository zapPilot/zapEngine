import { expect, test, type Page } from '@playwright/test';
const episode = {
  id: 'shell-episode',
  localizationId: 'shell-episode',
  title: 'Shell briefing',
  languageCode: 'en',
  createdAt: '2026-09-30T00:00:00.000Z',
  hlsUrl: 'https://media.example.test/shell/playlist.m3u8',
  video: null,
  audioTracks: [
    {
      languageCode: 'en',
      title: 'Shell briefing',
      hlsUrl: 'https://media.example.test/shell/playlist.m3u8',
    },
  ],
};
async function prepare(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() =>
    localStorage.setItem('content_language_code', 'en'),
  );
  await page.route('**/episodes/catalog*', (route) =>
    route.fulfill({
      json: { languages: { en: ['shell-episode'], 'zh-Hant': [], ja: [] } },
    }),
  );
  await page.route('**/episodes?**', (route) =>
    route.fulfill({ json: { items: [episode], nextCursor: null } }),
  );
  await page.route('**/episodes/shell-episode*', (route) =>
    route.fulfill({ json: episode }),
  );
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
  await expect(
    page.getByText('Something went wrong', { exact: true }),
  ).toHaveCount(0);
}
test('desktop navigation persists across episode routes and keeps locked guests on their current page', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await prepare(page, 1440);
  await page.goto('/podcast');
  const nav = page.getByRole('navigation', { name: 'Primary', exact: true });
  await expect(nav).toBeVisible({ timeout: 45000 });
  await expect(
    nav.getByRole('link', { name: 'Podcast', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('tablist', { name: 'App tabs', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Open Shell briefing', exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/podcast\/shell-episode\?lang=en$/);
  await expect(
    nav.getByRole('link', { name: 'Podcast', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await noOverflow(page);
  await nav.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await nav.getByRole('button', { name: 'Strategy', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Choose how to connect', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/home$/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await noOverflow(page);
  expect(errors).toEqual([]);
});
test('switches between bottom tabs and the sidebar at the 1024px boundary without overflow', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await prepare(page, 1023);
  await page.goto('/podcast');
  await expect(
    page.getByRole('tablist', { name: 'App tabs', exact: true }),
  ).toBeVisible({ timeout: 45000 });
  await expect(
    page.getByRole('navigation', { name: 'Primary', exact: true }),
  ).toHaveCount(0);
  await noOverflow(page);
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole('navigation', { name: 'Primary', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('tablist', { name: 'App tabs', exact: true }),
    ).toHaveCount(0);
    await noOverflow(page);
  }
  expect(errors).toEqual([]);
});
