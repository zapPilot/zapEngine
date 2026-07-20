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

const VIDEO_PODCAST_FIXTURE = {
  items: [
    {
      id: 'episode-2',
      localizationId: 'episode-2-zh-Hant',
      title: 'E2E video episode',
      languageCode: 'zh-Hant',
      hlsUrl: 'https://media.example.test/episode-2/playlist.m3u8',
      createdAt: '2026-07-02T00:00:00.000Z',
      listened: false,
      video: {
        url: 'https://media.example.test/episode-2/video.mp4',
        thumbnailUrl: 'https://media.example.test/episode-2/thumbnail.png',
        durationSeconds: 90,
      },
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
  await page.setViewportSize({ width: 390, height: 844 });
  await routePodcastFeed(page);

  await test.step('Podcast is the default guest route and all five tabs remain visible', async () => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/podcast$/, { timeout: 15_000 });

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

  await test.step('Podcast keeps search compact and exposes language completion', async () => {
    const searchInput = page.getByRole('textbox', {
      name: 'Search podcast episodes',
    });
    const headerSearchButton = page.getByRole('button', {
      name: 'Search podcast episodes',
    });

    await expect(searchInput).toBeHidden();
    await expect(headerSearchButton).toBeVisible();

    const searchButtonBounds = await headerSearchButton.boundingBox();
    if (searchButtonBounds === null) {
      throw new Error('Podcast search button has no layout bounds');
    }
    expect(searchButtonBounds.width).toBeGreaterThanOrEqual(44);
    expect(searchButtonBounds.height).toBeGreaterThanOrEqual(44);

    await headerSearchButton.click();
    await expect(searchInput).toBeVisible();

    await page.getByRole('button', { name: 'Cancel podcast search' }).click();
    await expect(searchInput).toBeHidden();

    const languageTrigger = page.getByRole('button', {
      name: 'Choose podcast language',
    });
    await expect(languageTrigger).toContainText('中');
    await expect(languageTrigger).toContainText('0%');
    await languageTrigger.click();

    for (const language of ['English', '繁體中文', '日本語']) {
      const option = page.getByRole('button', { name: new RegExp(language) });
      await expect(option).toBeVisible();
      await expect(option).toContainText('0%');
    }

    await page.getByRole('button', { name: /繁體中文/ }).click();
    await expect(page.getByText('語言里程碑')).toHaveCount(0);
    await expect(
      page
        .getByRole('button', { name: 'Open E2E Fed to Chain briefing' })
        .first(),
    ).toBeInViewport();
  });

  await test.step('audio-only episode detail keeps the video player hidden', async () => {
    await page
      .getByRole('button', { name: 'Open E2E Fed to Chain briefing' })
      .first()
      .click();
    await expect(page).toHaveURL(/\/podcast\/episode-1-zh-Hant\?lang=zh-Hant$/);
    await expect(page.locator('video')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Watch' })).toHaveCount(0);
  });

  await test.step('guest can open Home and return to Podcast', async () => {
    await page.goto('/podcast');
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

test('video is visible as an opt-in mode and does not load before selection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let releaseVideoResponse: () => void = () => undefined;
  const holdVideoResponse = new Promise<void>((resolve) => {
    releaseVideoResponse = resolve;
  });
  await page.route('**/episodes?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(VIDEO_PODCAST_FIXTURE),
    });
  });
  await page.route('**/episode-2/video.mp4', async (route) => {
    await holdVideoResponse;
    await route.abort();
  });

  await page.goto('/podcast');
  await page
    .getByRole('button', { name: 'Open E2E video episode' })
    .first()
    .click();
  await expect(page).toHaveURL(/\/podcast\/episode-2-zh-Hant\?lang=zh-Hant$/);

  const listenMode = page.getByRole('tab', { name: 'Listen' });
  const watchMode = page.getByRole('tab', { name: 'Watch' });
  await expect(listenMode).toHaveAttribute('aria-selected', 'true');
  await expect(watchMode).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByText('Video continues from 0:00')).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);

  const watchBounds = await watchMode.boundingBox();
  if (watchBounds === null) {
    throw new Error('Watch mode has no layout bounds');
  }
  expect(watchBounds.height).toBeGreaterThanOrEqual(44);

  const videoRequest = page.waitForRequest(
    'https://media.example.test/episode-2/video.mp4',
  );
  await watchMode.click();
  await videoRequest;
  await expect(page.locator('video')).toHaveCount(1);
  await expect(watchMode).toHaveAttribute('aria-selected', 'true');

  releaseVideoResponse();
  await expect(listenMode).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('video')).toHaveCount(0);
});
