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

const TAB_EXPECTATIONS = [
  { label: 'Home', url: /\/home$/, text: 'Net worth' },
  { label: 'Portfolio', url: /\/portfolio$/, text: 'Strategy position value' },
  { label: 'Strategy', url: /\/strategy$/, text: 'Zap Strategy' },
  { label: 'Podcast', url: /\/podcast$/, text: 'E2E Fed to Chain briefing' },
  { label: 'Activity', url: /\/activity$/, text: 'Activity' },
  { label: 'Account', url: /\/account$/, text: 'Connect wallet' },
] as const;

async function routePodcastFeed(page: Page): Promise<void> {
  await page.route('**/episodes?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(PODCAST_FIXTURE),
    });
  });
}

test('renders the web app shell and primary routes without page errors', async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await routePodcastFeed(page);

  await page.goto('/');
  await expect(page.getByText('Net worth')).toBeVisible();
  await expect(page.getByText('Wallet assets')).toBeVisible();
  await expect(page.getByText('Demo')).toBeVisible();

  for (const tab of TAB_EXPECTATIONS) {
    await page.getByText(tab.label, { exact: true }).click();
    await expect(page).toHaveURL(tab.url);
    await expect(
      page.getByText(tab.text, { exact: true }).first(),
    ).toBeVisible();
  }

  await page.goto('/send?token=USDC');
  await expect(page).toHaveURL(/\/send\?token=USDC$/);
  await expect(page.getByText('Send', { exact: true })).toBeVisible();
  await expect(page.getByText('Connect wallet to send')).toBeVisible();

  expect(pageErrors).toEqual([]);
});
