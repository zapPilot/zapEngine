import { errorMessage } from '../lib/errorMessage.js';
import { convertTextToZhCN } from '../services/opencc.js';
import type { NewSocialAccountSnapshot } from '../types.js';
import {
  insertSocialAccountSnapshot,
  latestSocialAccountSnapshots,
} from './daemon-store.js';
import {
  type MetricsBrowserSession,
  parseFirstMetricNumber,
} from './metric-collectors.js';
import { findXProfileUrl } from './reconcile.js';
import { PROFILE_DIRECTORY as REDNOTE_PROFILE_DIRECTORY } from './rednote-browser.js';
import { readPublishState } from './state.js';
import { assertThreadsSessionReady } from './threads-auth.js';
import type { SocialPlatform } from './types.js';
import { PROFILE_DIRECTORY as X_PROFILE_DIRECTORY } from './x-playwright.js';

const REDNOTE_HOME_URL = 'https://creator.rednote.com/new/home';
const THREADS_API_BASE = 'https://graph.threads.net';
const BROWSER_TIMEOUT_MS = 30_000;
const REDNOTE_FOLLOWER_WAIT_MS = 15_000;
// One snapshot per platform per day. Follower counts move slowly, and a tighter
// cadence would open a browser on every minute-long daemon tick.
const SNAPSHOT_STALENESS_MS = 24 * 60 * 60_000;

interface CollectorContext {
  browser: MetricsBrowserSession;
  fetchImpl: typeof fetch;
}

type FollowerCollector = (
  context: CollectorContext,
) => Promise<NewSocialAccountSnapshot>;

/**
 * Reads the label's own text rather than a generated class name: both creator
 * UIs re-skin often, and the number sits beside the word in every layout seen so
 * far -- on the same line, or on the line under (or above) it in a stat grid.
 */
export function parseFollowerCountNear(
  text: string,
  label: string,
): number | null {
  const lines = text.split('\n').map((line) => line.trim());
  for (const [index, line] of lines.entries()) {
    if (!line.includes(label)) continue;
    for (const candidate of [
      line.replace(label, ' '),
      lines[index + 1] ?? '',
      lines[index - 1] ?? '',
    ]) {
      const value = parseFirstMetricNumber(candidate);
      if (value !== null) return value;
    }
  }
  return null;
}

export function isRednoteLoginUrl(url: string): boolean {
  return /login|passport|signin|auth/i.test(url);
}

export function isRednoteLoginSnippet(snippet: string): boolean {
  const normalized = convertTextToZhCN(snippet);
  if (normalized.includes('扫码登录')) return true;
  if (normalized.includes('请登录')) return true;
  if (normalized.includes('二维码') && normalized.includes('登录')) return true;
  if (normalized.includes('登录已过期') || normalized.includes('登录过期'))
    return true;
  if (normalized.includes('登录后查看')) return true;
  return false;
}

async function collectRednoteFollowers({
  browser,
}: CollectorContext): Promise<NewSocialAccountSnapshot> {
  return browser.withPage(
    REDNOTE_PROFILE_DIRECTORY,
    REDNOTE_HOME_URL,
    async (page) => {
      const body = page.locator('body');
      await body.waitFor({ state: 'visible', timeout: BROWSER_TIMEOUT_MS });

      const getUrl = (): string => {
        try {
          const maybeUrl = (page as unknown as { url?: () => string }).url;
          return typeof maybeUrl === 'function'
            ? maybeUrl.call(page)
            : REDNOTE_HOME_URL;
        } catch {
          return REDNOTE_HOME_URL;
        }
      };

      const initialUrl = getUrl();
      if (isRednoteLoginUrl(initialUrl)) {
        throw new Error(
          `Rednote session expired (redirected to login: ${initialUrl}).`,
        );
      }

      // The SPA shell renders <body> immediately, but account statistics are
      // fetched afterwards. Waiting only for body races the API response and
      // reads an empty state; we must wait for the follower label itself.
      const followerLocator = page.locator('text=粉丝').first();
      let sawFollowerLabel = false;
      try {
        await followerLocator.waitFor({
          state: 'visible',
          timeout: REDNOTE_FOLLOWER_WAIT_MS,
        });
        sawFollowerLabel = true;
      } catch {
        // Traditional pages use 粉絲; convertTextToZhCN normalizes it later, but
        // the live DOM still contains the original glyph. Probe once more.
        try {
          await page
            .locator('text=粉絲')
            .first()
            .waitFor({ state: 'visible', timeout: 2_000 });
          sawFollowerLabel = true;
        } catch {
          // Fall through to debug-aware error below.
        }
      }

      if (!sawFollowerLabel) {
        const currentUrl = getUrl();
        let snippet = '';
        try {
          const raw = await body.innerText();
          snippet = convertTextToZhCN(raw)
            .slice(0, 600)
            .replace(/\s+/gu, ' ')
            .trim();
        } catch {
          // Keep snippet empty; URL alone is still useful.
        }
        if (isRednoteLoginUrl(currentUrl) || isRednoteLoginSnippet(snippet)) {
          throw new Error(
            `Rednote session expired (login page detected at ${currentUrl}${snippet ? ` snippet="${snippet.slice(0, 200)}"` : ''}).`,
          );
        }
        throw new Error(
          `Rednote creator home exposed no follower count (url=${currentUrl} snippet=${snippet ? `"${snippet}"` : 'unreadable'}).`,
        );
      }

      const finalUrl = getUrl();
      if (isRednoteLoginUrl(finalUrl)) {
        throw new Error(
          `Rednote session expired (redirected to login: ${finalUrl}).`,
        );
      }

      const text = convertTextToZhCN(await body.innerText());
      if (isRednoteLoginSnippet(text) && !text.includes('粉丝')) {
        throw new Error(
          `Rednote session expired (login content detected at ${finalUrl}).`,
        );
      }

      const followers = parseFollowerCountNear(text, '粉丝');
      if (followers === null) {
        const snippet = text.slice(0, 600).replace(/\s+/gu, ' ').trim();
        throw new Error(
          `Rednote creator home exposed no follower count (url=${finalUrl} snippet="${snippet}").`,
        );
      }
      return { platform: 'rednote', followers, details: { label: '粉丝' } };
    },
  );
}

async function collectXFollowers({
  browser,
}: CollectorContext): Promise<NewSocialAccountSnapshot> {
  const profileUrl = findXProfileUrl(await readPublishState());
  if (!profileUrl) {
    throw new Error(
      'No published X post yet, so the publisher profile URL is unknown.',
    );
  }

  return browser.withPage(X_PROFILE_DIRECTORY, profileUrl, async (page) => {
    const link = page.locator('a[href$="/followers"]').first();
    await link.waitFor({ state: 'visible', timeout: BROWSER_TIMEOUT_MS });
    const followers = parseFirstMetricNumber(await link.innerText());
    if (followers === null) {
      throw new Error(`X profile ${profileUrl} exposed no follower count.`);
    }
    return { platform: 'x', followers, details: { profileUrl } };
  });
}

async function collectThreadsFollowers({
  fetchImpl,
}: CollectorContext): Promise<NewSocialAccountSnapshot> {
  const { session, profile } = await assertThreadsSessionReady({ fetchImpl });
  const url = new URL(
    `${THREADS_API_BASE}/${encodeURIComponent(profile.id)}/threads_insights`,
  );
  url.searchParams.set('metric', 'followers_count');
  url.searchParams.set('access_token', session.accessToken);

  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(BROWSER_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(`Threads insights failed with HTTP ${response.status}.`);
  }
  const followers = readThreadsFollowerCount(payload);
  if (followers === null) {
    throw new Error('Threads insights returned no followers_count value.');
  }
  return { platform: 'threads', followers, details: {} };
}

function readThreadsFollowerCount(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as { name?: unknown; total_value?: unknown };
    if (entry.name !== 'followers_count') continue;
    const value = (entry.total_value as { value?: unknown } | undefined)?.value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

// YouTube is absent on purpose: the publish OAuth scope is upload-only, so this
// daemon holds no credential that can read channel statistics. Per-post
// `subscribersGained` already comes from YouTube Analytics.
const COLLECTORS: Partial<Record<SocialPlatform, FollowerCollector>> = {
  rednote: collectRednoteFollowers,
  x: collectXFollowers,
  threads: collectThreadsFollowers,
};

export async function captureDueAccountSnapshots(input: {
  now: Date;
  browser: MetricsBrowserSession;
  log?: (message: string) => void;
  fetchImpl?: typeof fetch;
  latest?: typeof latestSocialAccountSnapshots;
  insert?: typeof insertSocialAccountSnapshot;
}): Promise<number> {
  const log = input.log ?? (() => void 0);
  const latest = await (input.latest ?? latestSocialAccountSnapshots)();
  const insert = input.insert ?? insertSocialAccountSnapshot;
  const context: CollectorContext = {
    browser: input.browser,
    fetchImpl: input.fetchImpl ?? fetch,
  };

  let captured = 0;
  for (const [platform, collect] of Object.entries(COLLECTORS)) {
    const previous = latest[platform as SocialPlatform];
    if (previous && !isStale(previous.captured_at, input.now)) continue;

    // Isolated per platform: a logged-out browser profile on one platform must
    // not cost the others their daily snapshot, and a failed read is never
    // recorded as a count.
    try {
      const snapshot = await collect(context);
      await insert(snapshot);
      captured += 1;
      log(
        `[social-daemon] account snapshot ${platform}: ${snapshot.followers} followers.`,
      );
    } catch (error) {
      log(
        `[social-daemon] account snapshot ${platform} failed: ${errorMessage(error)}`,
      );
    }
  }
  return captured;
}

function isStale(capturedAt: string, now: Date): boolean {
  const captured = Date.parse(capturedAt);
  if (Number.isNaN(captured)) return true;
  return now.getTime() - captured >= SNAPSHOT_STALENESS_MS;
}
