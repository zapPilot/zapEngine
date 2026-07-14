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
  {
    label: 'Home',
    path: '/home',
    url: /\/home$/,
  },
  {
    label: 'Strategy',
    path: '/strategy',
    url: /\/strategy$/,
  },
  {
    label: 'Podcast',
    path: '/podcast',
    url: /\/podcast$/,
  },
  {
    label: 'Activity',
    path: '/activity',
    url: /\/activity$/,
  },
  {
    label: 'Account',
    path: '/account',
    url: /\/account$/,
  },
] as const;

const ERROR_PAGE_PATTERN =
  /Something went wrong|Unhandled|ErrorBoundary|Page not found/i;
const AUTH_REQUIRED_ROUTES = new Set(['/strategy', '/activity', '/account']);

async function routePodcastFeed(page: Page): Promise<void> {
  await page.route('**/episodes?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(PODCAST_FIXTURE),
    });
  });
}

async function expectHealthyRoute(page: Page): Promise<void> {
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(ERROR_PAGE_PATTERN);
  await expect(page).not.toHaveURL(/\/404/);
}

test('renders the web app shell and primary routes without page errors', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(`${page.url()}: ${error.stack ?? error.message}`);
  });
  await routePodcastFeed(page);

  await test.step('Podcast is the default guest route and all five tabs remain visible', async () => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/podcast$/);

    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(5);
    await expect(tabs).toHaveText([
      'Home',
      'Strategy',
      'Podcast',
      'Activity',
      'Account',
    ]);
    await expect(page.getByRole('tab', { name: 'Podcast' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  await test.step('guest can open Home and return to Podcast', async () => {
    await page.getByRole('tab', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expectHealthyRoute(page);
    await expect(page.getByText('Sign in to continue')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Podcast' }).click();
    await expect(page).toHaveURL(/\/podcast$/);
  });

  await test.step('locked tabs start sign-in without leaving the guest route', async () => {
    for (const label of ['Strategy', 'Activity', 'Account'] as const) {
      await page.goto('/podcast');
      await page.getByRole('tab', { name: label }).click();
      await expect(page).toHaveURL(/\/podcast$/);
      await expect(page.getByRole('tab', { name: 'Podcast' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    }
  });

  for (const route of PRIMARY_ROUTES) {
    await test.step(`route ${route.label}`, async () => {
      await page.goto(route.path);
      await expect(page).toHaveURL(route.url);
      await expectHealthyRoute(page);
      if (AUTH_REQUIRED_ROUTES.has(route.path)) {
        await expect(
          page.getByText('Sign in to continue').first(),
        ).toBeVisible();
      }
    });
  }

  await test.step('Portfolio route requires authentication', async () => {
    await page.goto('/portfolio');
    await expect(page).toHaveURL(/\/portfolio$/);
    await expectHealthyRoute(page);
    await expect(page.getByText('Sign in to continue')).toBeVisible();
  });

  await test.step('Send route', async () => {
    await page.goto('/send?token=USDC');
    await expect(page).toHaveURL(/\/send\?token=USDC$/);
    await expectHealthyRoute(page);
    await expect(page.getByText('Sign in to continue')).toBeVisible();
  });

  expect(pageErrors).toEqual([]);
});
