import { expect, test, type Page } from '@playwright/test';

const PODCAST_FIXTURE = {
  items: [
    {
      id: 'episode-1',
      localizationId: 'episode-1-zh-Hant',
      title: 'E2E Fed to Chain briefing',
      languageCode: 'zh-Hant',
      hlsUrl: 'https://media.example.test/episode-1/playlist.m3u8',
      createdAt: '2026-07-01T00:00:00.000Z',
      listened: false,
    },
  ],
  nextCursor: null,
};

const PRIMARY_ROUTES = [
  { label: 'Home', path: '/home', url: /\/home$/ },
  { label: 'Strategy', path: '/strategy', url: /\/strategy$/ },
  { label: 'Podcast', path: '/podcast', url: /\/podcast$/ },
  { label: 'Activity', path: '/activity', url: /\/activity$/ },
  { label: 'Account', path: '/account', url: /\/account$/ },
] as const;

const ERROR_PAGE_PATTERN = /Something went wrong|Unhandled|ErrorBoundary|Page not found/i;

async function routePodcastFeed(page: Page): Promise<void> {
  await page.route('**/episodes?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(PODCAST_FIXTURE),
    });
  });
}

async function expectHealthyAppShell(page: Page): Promise<void> {
  await expect(page.locator('body')).not.toContainText(ERROR_PAGE_PATTERN);
  await expect(page.getByText('Home', { exact: true })).toBeVisible();
  await expect(page.getByText('Strategy', { exact: true })).toBeVisible();
}

test(
  'renders the web app shell and primary routes without page errors',
  async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));
    await routePodcastFeed(page);

    for (const route of PRIMARY_ROUTES) {
      await page.goto(route.path);
      await expect(page).toHaveURL(route.url);
      await expectHealthyAppShell(page);
    }

    await page.goto('/home');
    await page.getByText('Portfolio', { exact: true }).click();
    await expect(page).toHaveURL(/\/portfolio$/);
    await expect(page.getByText('Strategy position value')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(ERROR_PAGE_PATTERN);

    await page.goto('/send?token=USDC');
    await expect(page).toHaveURL(/\/send\?token=USDC$/);
    await expect(page.getByText('Send', { exact: true })).toBeVisible();
    await expect(page.getByText('Connect wallet to send')).toBeVisible();

    expect(pageErrors).toEqual([]);
  },
);
