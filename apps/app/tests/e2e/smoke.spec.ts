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
      video: null,
      audioTracks: [
        {
          languageCode: 'zh-Hant',
          title: 'E2E Fed to Chain briefing',
          hlsUrl: 'https://media.example.test/episode-1/playlist.m3u8',
          classroomHlsUrl:
            'https://media.example.test/episode-1/classroom.m3u8',
        },
      ],
    },
  ],
  nextCursor: null,
};

const PODCAST_FIXTURE_EN = {
  items: [
    {
      id: 'episode-1',
      localizationId: 'episode-1-en',
      title: 'E2E Fed to Chain briefing (EN)',
      languageCode: 'en',
      hlsUrl: 'https://media.example.test/episode-1-en/playlist.m3u8',
      createdAt: '2026-07-01T00:00:00.000Z',
      listened: false,
      video: null,
      audioTracks: [
        {
          languageCode: 'en',
          title: 'E2E Fed to Chain briefing (EN)',
          hlsUrl: 'https://media.example.test/episode-1-en/playlist.m3u8',
          classroomHlsUrl:
            'https://media.example.test/episode-1-en/classroom.m3u8',
        },
      ],
    },
  ],
  nextCursor: null,
};

const GENERATING_PODCAST_EPISODE = {
  id: 'episode-3',
  localizationId: 'episode-3-zh-Hant',
  title: 'E2E generating video episode',
  languageCode: 'zh-Hant',
  hlsUrl: 'https://media.example.test/episode-3/playlist.m3u8',
  createdAt: '2026-07-03T00:00:00.000Z',
  listened: false,
  video: null,
  videoGeneration: {
    status: 'processing',
    updatedAt: '2026-07-03T00:05:00.000Z',
  },
  audioTracks: [
    {
      languageCode: 'zh-Hant',
      title: 'E2E generating video episode',
      hlsUrl: 'https://media.example.test/episode-3/playlist.m3u8',
      classroomHlsUrl: 'https://media.example.test/episode-3/classroom.m3u8',
    },
  ],
};

const GENERATING_PODCAST_FIXTURE = {
  items: [GENERATING_PODCAST_EPISODE],
  nextCursor: null,
};

/**
 * The render row is still `queued` here on purpose: the slow image search runs on
 * the episode-scoped visual job, and the bar has to move during it.
 */
const GENERATING_WITH_PROGRESS_EPISODE = {
  ...GENERATING_PODCAST_EPISODE,
  videoGeneration: {
    status: 'queued',
    updatedAt: '2026-07-03T00:05:00.000Z',
    progressPercent: 42,
    stage: 'preparing-media',
  },
};

const COMPLETED_PODCAST_DETAIL_FIXTURE = {
  ...GENERATING_PODCAST_EPISODE,
  video: {
    url: 'https://media.example.test/episode-3/video.mp4',
    thumbnailUrl: 'https://media.example.test/episode-3/thumbnail.png',
    durationSeconds: 90,
  },
  videoGeneration: {
    status: 'completed',
    updatedAt: '2026-07-03T00:10:00.000Z',
  },
};

const FAILED_PODCAST_DETAIL_FIXTURE = {
  ...GENERATING_PODCAST_EPISODE,
  videoGeneration: {
    status: 'failed',
    updatedAt: '2026-07-03T00:10:00.000Z',
  },
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
      audioTracks: [
        {
          languageCode: 'zh-Hant',
          title: 'E2E video episode',
          hlsUrl: 'https://media.example.test/episode-2/playlist.m3u8',
          classroomHlsUrl:
            'https://media.example.test/episode-2/classroom.m3u8',
        },
      ],
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
type MediaSessionProbeWindow = Window & {
  __mediaSessionActions?: string[];
};

const AUTH_REQUIRED_ROUTES = new Set(['/strategy', '/activity', '/account']);
const APP_BOOT_TIMEOUT = 45_000;
const EPISODE_MEDIA_TAB_LABELS = ['Story', 'Classroom', 'Video'] as const;

async function routePodcastFeed(page: Page): Promise<void> {
  await page.route('**/episodes?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(PODCAST_FIXTURE),
    });
  });
}

async function routePodcastFeedByLanguage(page: Page): Promise<void> {
  await page.route('**/episodes?**', async (route) => {
    const requestedLanguage = new URL(route.request().url()).searchParams.get(
      'language',
    );
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        requestedLanguage === 'en' ? PODCAST_FIXTURE_EN : PODCAST_FIXTURE,
      ),
    });
  });
}

async function routeGeneratingPodcastFeed(page: Page): Promise<void> {
  await page.route('**/episodes?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(GENERATING_PODCAST_FIXTURE),
    });
  });
}

async function expectHealthyRoute(page: Page): Promise<void> {
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(ERROR_PAGE_PATTERN);
  await expect(page).not.toHaveURL(/\/404/);
}

async function expectResponsiveEpisodeMediaTabs(page: Page): Promise<void> {
  const tabs = EPISODE_MEDIA_TAB_LABELS.map((label) =>
    page.getByRole('tab', { name: label, exact: true }),
  );
  const [storyTab] = tabs;
  if (storyTab === undefined) {
    throw new Error('Story tab locator is unavailable');
  }

  for (const tab of tabs) {
    await expect(tab).toBeVisible();
  }
  await expect(storyTab).toHaveAttribute('aria-selected', 'true');

  const tabList = page.getByRole('tablist').filter({ has: storyTab });
  await expect(tabList).toHaveCount(1);

  const tabListMetrics = await tabList.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(tabListMetrics.clientWidth).toBeGreaterThan(0);
  expect(tabListMetrics.scrollWidth).toBeLessThanOrEqual(
    tabListMetrics.clientWidth + 1,
  );

  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('Viewport size is unavailable');

  const bounds = await Promise.all(tabs.map((tab) => tab.boundingBox()));
  const firstBounds = bounds[0];
  if (firstBounds === null || firstBounds === undefined) {
    throw new Error('Story tab has no layout bounds');
  }
  for (const [index, box] of bounds.entries()) {
    if (box === null) {
      throw new Error(`${EPISODE_MEDIA_TAB_LABELS[index]} tab has no bounds`);
    }
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(Math.abs(box.y - firstBounds.y)).toBeLessThanOrEqual(1);
  }

  const documentMetrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(documentMetrics.scrollWidth).toBeLessThanOrEqual(
    documentMetrics.clientWidth + 1,
  );
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
    await expect(page).toHaveURL(/\/podcast$/, {
      timeout: APP_BOOT_TIMEOUT,
    });

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
      name: 'Choose app language',
    });
    await expect(languageTrigger).toContainText('EN');
    await expect(languageTrigger).toContainText('0%');
    await languageTrigger.click();

    for (const language of ['English', '繁體中文', '日本語']) {
      const option = page.getByRole('button', { name: new RegExp(language) });
      await expect(option).toBeVisible();
      await expect(option).toContainText('0%');
    }

    await page.getByRole('button', { name: /繁體中文/ }).click();
    await expect(page.getByRole('tab', { name: '首頁' })).toBeVisible();
    await expect(page.getByText('語言里程碑')).toHaveCount(0);
    await expect(
      page
        .getByRole('button', { name: '開啟「E2E Fed to Chain briefing」' })
        .first(),
    ).toBeInViewport();

    const localizedLanguageTrigger = page.getByRole('button', {
      name: '選擇 App 語言',
    });
    await expect(localizedLanguageTrigger).toContainText('中');
    await localizedLanguageTrigger.click();
    await page.getByRole('button', { name: /English/ }).click();
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible();
  });

  await test.step('audio-only episode detail keeps the video player unloaded', async () => {
    await page
      .getByRole('button', { name: 'Open E2E Fed to Chain briefing' })
      .first()
      .click();
    await expect(page).toHaveURL(/\/podcast\/episode-1-zh-Hant\?lang=zh-Hant$/);
    await expect(page.locator('video')).toHaveCount(0);
    await expectResponsiveEpisodeMediaTabs(page);
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

test('registers headset transport actions with the media session', async ({
  page,
}) => {
  // The handlers install once when the player provider mounts, and the Media
  // Session API exposes no getter for them, so the registrations have to be
  // recorded before the bundle runs.
  await page.addInitScript(() => {
    const actions: string[] = [];
    (window as MediaSessionProbeWindow).__mediaSessionActions = actions;

    const { mediaSession } = navigator;
    const setActionHandler = mediaSession.setActionHandler.bind(mediaSession);
    mediaSession.setActionHandler = (action, handler) => {
      if (handler !== null) actions.push(action);
      setActionHandler(action, handler);
    };
  });

  await routePodcastFeed(page);
  await page.goto('/podcast');
  await expect(page).toHaveURL(/\/podcast$/, { timeout: APP_BOOT_TIMEOUT });

  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as MediaSessionProbeWindow).__mediaSessionActions ?? [],
        ),
      { timeout: APP_BOOT_TIMEOUT },
    )
    .toEqual([
      'play',
      'pause',
      'seekbackward',
      'seekforward',
      'nexttrack',
      'previoustrack',
    ]);
});

test('episode media tabs stay fixed before playback at mobile and web widths', async ({
  page,
}) => {
  await routePodcastFeed(page);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
  ]) {
    await test.step(`${viewport.width}x${viewport.height}`, async () => {
      await page.setViewportSize(viewport);
      await page.goto('/podcast/episode-1-zh-Hant?lang=zh-Hant');
      await expect(page).toHaveURL(
        /\/podcast\/episode-1-zh-Hant\?lang=zh-Hant$/,
        { timeout: APP_BOOT_TIMEOUT },
      );
      await expectResponsiveEpisodeMediaTabs(page);
      await expect(page.locator('video')).toHaveCount(0);
    });
  }
});

test('audio-only episode keeps Video selectable with an unavailable state', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await routePodcastFeed(page);
  await page.goto('/podcast/episode-1-zh-Hant?lang=zh-Hant');
  await expect(
    page.getByRole('tab', { name: 'Video', exact: true }),
  ).toBeVisible({ timeout: APP_BOOT_TIMEOUT });

  const videoTab = page.getByRole('tab', { name: 'Video', exact: true });
  await videoTab.click();

  await expect(videoTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Video isn’t available yet')).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
});

test('back button from a deep-linked episode returns to the podcast list', async ({
  page,
}) => {
  await routePodcastFeed(page);
  await page.goto('/podcast/episode-1-zh-Hant?lang=zh-Hant');
  await expect(
    page.getByRole('tab', { name: 'Story', exact: true }),
  ).toBeVisible({ timeout: APP_BOOT_TIMEOUT });

  await page.getByRole('button', { name: 'Back', exact: true }).click();

  await expect(page).toHaveURL(/\/podcast$/);
});

test('choosing a language on the episode detail screen switches the displayed localization', async ({
  page,
}) => {
  await routePodcastFeedByLanguage(page);

  // Land on zh-Hant deliberately through the UI (rather than relying on the
  // browser's default locale, which the sandboxed test runner resolves to
  // "en") so the feed request and the detail route's `?lang=` agree from the
  // start, matching how a real user would already be on this screen before
  // touching the language picker.
  await page.goto('/podcast');
  await expect(page).toHaveURL(/\/podcast$/, { timeout: APP_BOOT_TIMEOUT });
  await page.getByRole('button', { name: 'Choose app language' }).click();
  await page.getByRole('button', { name: /繁體中文/ }).click();

  await page
    .getByRole('button', { name: '開啟「E2E Fed to Chain briefing」' })
    .first()
    .click();
  await expect(page).toHaveURL(/\/podcast\/episode-1-zh-Hant\?lang=zh-Hant$/, {
    timeout: APP_BOOT_TIMEOUT,
  });
  await expect(
    page.getByRole('tab', { name: 'Story', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('E2E Fed to Chain briefing (EN)')).toHaveCount(0);

  await page.getByRole('button', { name: '選擇 App 語言' }).click();
  await page.getByRole('button', { name: /^English$/ }).click();

  await expect(page).toHaveURL(/\/podcast\/episode-1\?lang=en$/);
  // Scoped to the hero card's title style: the same title text is also
  // rendered (currently hidden) inside the media player's Video tab panel,
  // so a bare getByText would hit a strict-mode violation.
  await expect(
    page.locator('div[class*="text-[25px]"]', {
      hasText: 'E2E Fed to Chain briefing (EN)',
    }),
  ).toBeVisible();
});

test('processing video generation shows a live generating state', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await routeGeneratingPodcastFeed(page);
  await page.route('**/episodes/episode-3-zh-Hant**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(GENERATING_PODCAST_EPISODE),
    });
  });

  await page.goto('/podcast/episode-3-zh-Hant?lang=zh-Hant');
  const videoTab = page.getByRole('tab', { name: 'Video', exact: true });
  await expect(videoTab).toBeVisible({ timeout: APP_BOOT_TIMEOUT });
  await videoTab.click();

  await expect(videoTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Video is being generated')).toBeVisible();
  await expect(page.getByLabel('Generating video')).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
});

test('reported progress shows a determinate video progress bar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await routeGeneratingPodcastFeed(page);
  await page.route('**/episodes/episode-3-zh-Hant**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(GENERATING_WITH_PROGRESS_EPISODE),
    });
  });

  await page.goto('/podcast/episode-3-zh-Hant?lang=zh-Hant');
  const videoTab = page.getByRole('tab', { name: 'Video', exact: true });
  await expect(videoTab).toBeVisible({ timeout: APP_BOOT_TIMEOUT });
  await videoTab.click();

  // Scoped by accessible name: the detail skeleton also carries a progressbar
  // role, and the two must not be confused.
  const bar = page.getByRole('progressbar', { name: 'Generating video' });
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute('aria-valuenow', '42');
  await expect(bar).toHaveAttribute('aria-valuemax', '100');
  await expect(page.getByText('Preparing the scenes')).toBeVisible();
  await expect(page.getByText('42%')).toBeVisible();

  // The fill must actually paint: a percentage width inside an auto-sized parent
  // is exactly how a bar like this ships invisible.
  const fillWidth = await bar
    .locator('div')
    .first()
    .evaluate((node) => node.getBoundingClientRect().width);
  expect(fillWidth).toBeGreaterThan(0);
});

test('video polling stops after a completed detail becomes ready', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install();
  await routeGeneratingPodcastFeed(page);

  let detailRequestCount = 0;
  await page.route('**/episodes/episode-3-zh-Hant**', async (route) => {
    detailRequestCount += 1;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        detailRequestCount === 1
          ? GENERATING_PODCAST_EPISODE
          : COMPLETED_PODCAST_DETAIL_FIXTURE,
      ),
    });
  });

  await page.goto('/podcast/episode-3-zh-Hant?lang=zh-Hant');
  const videoTab = page.getByRole('tab', { name: 'Video', exact: true });
  await expect(videoTab).toBeVisible({ timeout: APP_BOOT_TIMEOUT });
  await videoTab.click();
  await expect(page.getByText('Video is being generated')).toBeVisible();
  await expect.poll(() => detailRequestCount).toBe(1);

  await page.clock.runFor(20_000);
  await expect.poll(() => detailRequestCount).toBe(2);

  await expect(page.getByText('Video is ready')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Play video', exact: true }),
  ).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);

  await page.clock.runFor(20_000);
  await expect.poll(() => detailRequestCount).toBe(2);
});

test('failed video detail shows a redacted failure state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await routeGeneratingPodcastFeed(page);
  await page.route('**/episodes/episode-3-zh-Hant**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(FAILED_PODCAST_DETAIL_FIXTURE),
    });
  });

  await page.goto('/podcast/episode-3-zh-Hant?lang=zh-Hant');
  const videoTab = page.getByRole('tab', { name: 'Video', exact: true });
  await expect(videoTab).toBeVisible({ timeout: APP_BOOT_TIMEOUT });
  await videoTab.click();

  await expect(page.getByText('Video unavailable')).toBeVisible();
  await expect(
    page.getByText(
      'Video generation failed for this episode. Story and Classroom audio still work.',
    ),
  ).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
});

test('complete video stays lazy and falls back to Story after an error', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let videoRequestCount = 0;
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
    videoRequestCount += 1;
    await holdVideoResponse;
    await route.abort();
  });

  await page.goto('/podcast');
  const episodeButton = page
    .getByRole('button', { name: 'Open E2E video episode' })
    .first();
  await expect(episodeButton).toBeVisible({ timeout: APP_BOOT_TIMEOUT });
  await episodeButton.click();
  await expect(page).toHaveURL(/\/podcast\/episode-2-zh-Hant\?lang=zh-Hant$/);

  const storyTab = page.getByRole('tab', { name: 'Story', exact: true });
  const videoTab = page.getByRole('tab', { name: 'Video', exact: true });
  await expectResponsiveEpisodeMediaTabs(page);
  await expect(storyTab).toHaveAttribute('aria-selected', 'true');
  await expect(videoTab).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator('video')).toHaveCount(0);
  expect(videoRequestCount).toBe(0);

  const videoRequest = page.waitForRequest(
    'https://media.example.test/episode-2/video.mp4',
  );
  await videoTab.click();
  await videoRequest;
  await expect.poll(() => videoRequestCount).toBe(1);
  await expect(page.locator('video')).toHaveCount(1);
  await expect(videoTab).toHaveAttribute('aria-selected', 'true');

  releaseVideoResponse();
  await expect(page.locator('video')).toHaveCount(0, { timeout: 10_000 });
  await expect(storyTab).toHaveAttribute('aria-selected', 'true');
  await expect(videoTab).toHaveAttribute('aria-selected', 'false');
});
