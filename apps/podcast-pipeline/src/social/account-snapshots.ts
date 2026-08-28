import type { APIRequestContext } from 'playwright-core';

import { errorMessage } from '../lib/errorMessage.js';
import { isPlainRecord as isRecord } from '../lib/typeGuards.js';
import type { NewSocialAccountSnapshot } from '../types.js';
import {
  insertSocialAccountSnapshot,
  latestSocialAccountSnapshots,
} from './daemon-store.js';
import { platformIcon } from './log-format.js';
import {
  type MetricsBrowserSession,
  parseFirstMetricNumber,
  parseMetricNumber,
} from './metric-collectors.js';
import { findXProfileUrl } from './reconcile.js';
import { PROFILE_DIRECTORY as REDNOTE_PROFILE_DIRECTORY } from './rednote-browser.js';
import { readPublishState } from './state.js';
import { assertThreadsSessionReady } from './threads-auth.js';
import type { SocialPlatform } from './types.js';
import { PROFILE_DIRECTORY as X_PROFILE_DIRECTORY } from './x-playwright.js';

const REDNOTE_USER_INFO_URL =
  'https://creator.rednote.com/api/galaxy/user/info';
const REDNOTE_PROFILE_URL_PREFIX = 'https://www.rednote.com/user/profile/';
const THREADS_API_BASE = 'https://graph.threads.net';
const BROWSER_TIMEOUT_MS = 30_000;
// Best-effort three-hour sampling gives follower-delta intervals small enough
// to correlate with the reduced publishing cadence without adding another cron.
const SNAPSHOT_STALENESS_MS = 3 * 60 * 60_000;

interface CollectorContext {
  browser: MetricsBrowserSession;
  fetchImpl: typeof fetch;
}

type FollowerCollector = (
  context: CollectorContext,
) => Promise<NewSocialAccountSnapshot>;

/**
 * The creator platform no longer ships a page carrying this number: every
 * creator route other than publish/note-manager now redirects to the publish
 * shell, which shows the upload form and nothing about the account. The count
 * lives on the consumer profile page instead, and that page is server-rendered
 * -- the number is in the first response, so nothing here waits on hydration.
 *
 * It is read from the embedded state's `fans` entry rather than from the
 * visible label because that page renders in the viewer's language (`Followers`
 * on the international domain, `粉丝` on the mainland one) while the entry type
 * is the backend's own name for it. The neighbouring `Likes & Saves` figure sits
 * one line below the label in the rendered text, so a label-relative text read
 * has a wrong number within reach; this one does not.
 */
export function extractRednoteFollowerText(html: string): string | null {
  const entry = /\{[^{}]*"type"\s*:\s*"fans"[^{}]*\}/u.exec(html)?.[0];
  if (!entry) return null;
  return /"count"\s*:\s*"([^"]*)"/u.exec(entry)?.[1] ?? null;
}

export function parseRednoteUserId(payload: unknown): string | null {
  if (!isRecord(payload) || !isRecord(payload['data'])) return null;
  const userId = payload['data']['userId'];
  return typeof userId === 'string' && userId.trim() ? userId.trim() : null;
}

async function readRednoteUserId(request: APIRequestContext): Promise<string> {
  const response = await request.get(REDNOTE_USER_INFO_URL, {
    timeout: BROWSER_TIMEOUT_MS,
  });
  if (!response.ok()) {
    throw new Error(
      `Rednote session expired (creator user info returned HTTP ${response.status()}). Run \`pnpm social:login\` to sign the browser profile in again.`,
    );
  }
  const userId = parseRednoteUserId(
    (await response.json().catch(() => null)) as unknown,
  );
  if (!userId) {
    throw new Error('Rednote creator user info exposed no user id.');
  }
  return userId;
}

async function collectRednoteFollowers({
  browser,
}: CollectorContext): Promise<NewSocialAccountSnapshot> {
  return browser.withRequest(REDNOTE_PROFILE_DIRECTORY, async (request) => {
    const userId = await readRednoteUserId(request);
    const profileUrl = `${REDNOTE_PROFILE_URL_PREFIX}${userId}`;
    const response = await request.get(profileUrl, {
      timeout: BROWSER_TIMEOUT_MS,
    });
    if (!response.ok()) {
      throw new Error(
        `Rednote profile ${profileUrl} returned HTTP ${response.status()}.`,
      );
    }

    const raw = extractRednoteFollowerText(await response.text());
    if (raw === null) {
      throw new Error(
        `Rednote profile ${profileUrl} exposed no follower count.`,
      );
    }
    const followers = parseMetricNumber(raw);
    if (followers === null) {
      throw new Error(
        `Rednote profile ${profileUrl} exposed a masked follower count ("${raw}"), which is what a signed-out read returns. Run \`pnpm social:login\` to sign the browser profile in again.`,
      );
    }
    return { platform: 'rednote', followers, details: { profileUrl } };
  });
}

export function xFollowerLinkSelector(profileUrl: string): string {
  const [handle, ...rest] = new URL(profileUrl).pathname
    .split('/')
    .filter(Boolean);
  if (rest.length > 0 || !handle || !/^\w{1,15}$/u.test(handle)) {
    throw new Error(`X profile ${profileUrl} carries no readable handle.`);
  }
  return `a[href="/${handle}/verified_followers"], a[href="/${handle}/followers"]`;
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
    const link = page.locator(xFollowerLinkSelector(profileUrl)).first();
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

    try {
      const snapshot = await collect(context);
      await insert(snapshot);
      captured += 1;
      log(
        `📊 [social-daemon] ${platformIcon(platform)} ${platform} · account snapshot · ${snapshot.followers} followers`,
      );
    } catch (error) {
      log(
        `❌ [social-daemon] ${platformIcon(platform)} ${platform} · account snapshot failed · ${errorMessage(error)}`,
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
