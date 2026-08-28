import type { BrowserContext, Page } from 'playwright';

import { errorMessage } from '../lib/errorMessage.js';
import type { NewSocialAccountSnapshot } from '../types.js';
import {
  insertSocialAccountSnapshot,
  latestSocialAccountSnapshots,
} from './daemon-store.js';
import type { SocialMetricsBrowserSession } from './metric-collectors.js';
import { extractMetricNumber } from './metrics.js';
import type { SocialPlatform } from './platforms.js';
import {
  getRednoteProfileUrl,
  getThreadsProfileUrl,
  getXProfileUrl,
} from './publish-config.js';

const SNAPSHOT_STALENESS_MS = 3 * 60 * 60_000;
const NAVIGATION_TIMEOUT_MS = 30_000;

type SnapshotCollector = (input: {
  browser: SocialMetricsBrowserSession;
}) => Promise<NewSocialAccountSnapshot | null>;

export async function captureDueAccountSnapshots(input: {
  now: Date;
  browser: SocialMetricsBrowserSession;
  log?: (message: string) => void;
}): Promise<number> {
  const log = input.log ?? (() => void 0);
  const latest = await latestSocialAccountSnapshots();
  let inserted = 0;

  for (const platform of ['rednote', 'threads', 'x'] as const) {
    const previous = latest[platform];
    if (
      previous &&
      input.now.getTime() - Date.parse(previous.captured_at) <
        SNAPSHOT_STALENESS_MS
    ) {
      continue;
    }

    try {
      const snapshot = await collectors[platform]({ browser: input.browser });
      if (!snapshot) continue;
      await insertSocialAccountSnapshot(snapshot);
      inserted += 1;
      log(
        `👥 [social-daemon] ${platform} account snapshot · ${snapshot.followers} followers`,
      );
    } catch (error) {
      log(
        `❌ [social-daemon] ${platform} account snapshot failed · ${errorMessage(error)}`,
      );
    }
  }

  return inserted;
}

const collectors: Record<
  Exclude<SocialPlatform, 'youtube'>,
  SnapshotCollector
> = {
  rednote: collectRednoteAccountSnapshot,
  threads: collectThreadsAccountSnapshot,
  x: collectXAccountSnapshot,
};

async function collectRednoteAccountSnapshot(input: {
  browser: SocialMetricsBrowserSession;
}): Promise<NewSocialAccountSnapshot | null> {
  return withPage(input.browser.context, async (page) => {
    const url = getRednoteProfileUrl();
    if (!url) return null;
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    const text = await page.locator('body').innerText();
    return {
      platform: 'rednote',
      followers: extractFollowerCount(text),
      details: { profileUrl: url },
    };
  });
}

async function collectThreadsAccountSnapshot(input: {
  browser: SocialMetricsBrowserSession;
}): Promise<NewSocialAccountSnapshot | null> {
  return withPage(input.browser.context, async (page) => {
    const url = getThreadsProfileUrl();
    if (!url) return null;
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    const text = await page.locator('body').innerText();
    return {
      platform: 'threads',
      followers: extractFollowerCount(text),
      details: { profileUrl: url },
    };
  });
}

async function collectXAccountSnapshot(input: {
  browser: SocialMetricsBrowserSession;
}): Promise<NewSocialAccountSnapshot | null> {
  return withPage(input.browser.context, async (page) => {
    const url = getXProfileUrl();
    if (!url) return null;
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    const text = await page.locator('body').innerText();
    return {
      platform: 'x',
      followers: extractFollowerCount(text),
      details: { profileUrl: url },
    };
  });
}

function extractFollowerCount(text: string): number {
  const patterns = [
    /([\d,.]+(?:\s*[KMB万萬])?)\s*(?:followers|follower)/i,
    /(?:followers|follower)\s*([\d,.]+(?:\s*[KMB万萬])?)/i,
    /([\d,.]+(?:\s*[KMB万萬])?)\s*(?:粉絲|粉丝)/i,
    /(?:粉絲|粉丝)\s*([\d,.]+(?:\s*[KMB万萬])?)/i,
    /フォロワー\s*([\d,.]+(?:\s*[KMB万萬])?)/i,
    /([\d,.]+(?:\s*[KMB万萬])?)\s*フォロワー/i,
  ];
  for (const pattern of patterns) {
    const matched = text.match(pattern)?.[1];
    if (!matched) continue;
    const followers = extractMetricNumber(matched);
    if (followers !== null) return followers;
  }
  throw new Error('Follower count was not found on the profile page');
}

async function withPage<T>(
  context: BrowserContext,
  task: (page: Page) => Promise<T>,
): Promise<T> {
  const page = await context.newPage();
  try {
    return await task(page);
  } finally {
    await page.close();
  }
}
