import {
  type APIRequestContext,
  type BrowserContext,
  chromium,
  type Page,
} from 'playwright-core';

import { toError } from '../lib/errorMessage.js';
import { isPlainRecord as isRecord } from '../lib/typeGuards.js';
import { convertTextToZhCN } from '../services/opencc.js';
import type { SocialPostMetricDetails, SocialPostRow } from '../types.js';
import type { CollectedSocialMetrics, SocialMetricCounts } from './metrics.js';
import { PROFILE_DIRECTORY as REDNOTE_PROFILE_DIRECTORY } from './rednote-browser.js';
import {
  assertThreadsSessionReady,
  THREADS_INSIGHTS_SCOPE,
} from './threads-auth.js';
import type { SocialPlatform, SocialReviewStatus } from './types.js';
import { PROFILE_DIRECTORY as X_PROFILE_DIRECTORY } from './x-playwright.js';
import {
  assertYouTubeSessionReady,
  YOUTUBE_ANALYTICS_SCOPE,
} from './youtube-auth.js';

const THREADS_API_BASE = 'https://graph.threads.net';
const YOUTUBE_DATA_API = 'https://www.googleapis.com/youtube/v3/videos';
const YOUTUBE_ANALYTICS_API =
  'https://youtubeanalytics.googleapis.com/v2/reports';
const REDNOTE_MANAGER_URL = 'https://creator.rednote.com/new/note-manager';
const BROWSER_TIMEOUT_MS = 30_000;

async function fetchJsonWithTimeout(
  fetchImpl: typeof fetch,
  url: URL,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const response = await fetchImpl(url, {
    ...init,
    signal: AbortSignal.timeout(BROWSER_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  return { ok: response.ok, status: response.status, payload };
}

export type SocialMetricCollector = (
  post: SocialPostRow,
) => Promise<CollectedSocialMetrics>;

export interface RecoveredPublishedPost {
  platformPostId: string;
  postUrl: string;
  publishedTitle: string | null;
  publishedBody: string;
  hashtags: string[];
  videoDurationSec: number | null;
}

const EMPTY_COUNTS: SocialMetricCounts = {
  views: null,
  impressions: null,
  likes: null,
  comments: null,
  shares: null,
  saves: null,
  profileVisits: null,
  followersGained: null,
};

export function createMetricCollectors(input?: {
  browser?: MetricsBrowserSession;
  fetchImpl?: typeof fetch;
  onRednoteIdentity?: (input: {
    post: SocialPostRow;
    platformPostId: string;
    postUrl: string;
  }) => Promise<void>;
  onRednoteReviewStatus?: (input: {
    post: SocialPostRow;
    reviewStatus: SocialReviewStatus;
  }) => Promise<void>;
}): Record<SocialPlatform, SocialMetricCollector> {
  const fetchImpl = input?.fetchImpl ?? fetch;
  const browser = input?.browser;
  return {
    threads: (post) => collectThreadsMetrics(post, fetchImpl),
    youtube: (post) => collectYouTubeMetrics(post, fetchImpl),
    x: (post) => collectXMetrics(post, browser),
    rednote: (post) =>
      collectRednoteMetrics(
        post,
        input?.onRednoteIdentity ?? (async () => {}),
        browser,
        input?.onRednoteReviewStatus ?? (async () => {}),
      ),
  };
}

// Rednote shows moderation state as a badge inside the note card, under
// generated class names, so it is read from the card's own text. Markers stay
// narrow on purpose: 违规 or 已下架 would also match a post *about* enforcement.
const REDNOTE_REVIEW_MARKERS: readonly {
  status: SocialReviewStatus;
  markers: readonly string[];
}[] = [
  { status: 'rejected', markers: ['未通过', '不通过'] },
  { status: 'under_review', markers: ['审核中', '待审核'] },
  { status: 'self_only', markers: ['仅自己可见'] },
];

export function detectRednoteReviewStatus(
  cardText: string,
): SocialReviewStatus {
  const normalized = convertTextToZhCN(cardText).normalize('NFKC');
  for (const { status, markers } of REDNOTE_REVIEW_MARKERS) {
    if (markers.some((marker) => normalized.includes(marker))) return status;
  }
  return 'visible';
}

export async function collectThreadsMetrics(
  post: SocialPostRow,
  fetchImpl: typeof fetch = fetch,
): Promise<SocialMetricCounts> {
  const postId = requirePlatformPostId(post);
  const { session } = await assertThreadsSessionReady({
    fetchImpl,
    additionalScopes: [THREADS_INSIGHTS_SCOPE],
  });
  const url = new URL(
    `${THREADS_API_BASE}/${encodeURIComponent(postId)}/insights`,
  );
  url.searchParams.set('metric', 'views,likes,replies,reposts,quotes,shares');
  url.searchParams.set('access_token', session.accessToken);

  const { ok, status, payload } = await fetchJsonWithTimeout(fetchImpl, url);
  if (!ok) {
    throw new Error(`Threads insights failed with HTTP ${status}.`);
  }
  if (!isRecord(payload) || !Array.isArray(payload['data'])) {
    throw new Error('Threads insights returned an invalid response.');
  }
  const metrics = new Map<string, number>();
  for (const item of payload['data']) {
    if (!isRecord(item) || typeof item['name'] !== 'string') continue;
    const value = extractInsightValue(item);
    if (value !== null) metrics.set(item['name'], value);
  }

  return {
    ...EMPTY_COUNTS,
    views: metrics.get('views') ?? null,
    likes: metrics.get('likes') ?? null,
    comments: metrics.get('replies') ?? null,
    shares: sumKnown([
      metrics.get('shares'),
      metrics.get('reposts'),
      metrics.get('quotes'),
    ]),
  };
}

/**
 * The public counters are read with an API key rather than the session's bearer
 * token. `videos.list` only honours `youtube.readonly` and wider scopes, while
 * the session deliberately carries just `youtube.upload` + `yt-analytics.readonly`
 * so no metrics snapshot can widen the grant to full read access over the
 * account's channels — the same reason the channel guard proves identity through
 * Analytics instead of `channels.list` (see ./README.md, "Channel guard").
 * Daemon uploads are always public, so an API key can read these counters.
 */
export async function collectYouTubeMetrics(
  post: SocialPostRow,
  fetchImpl: typeof fetch = fetch,
): Promise<CollectedSocialMetrics> {
  const videoId = requirePlatformPostId(post);
  const apiKey = process.env['YOUTUBE_API_KEY']?.trim();
  if (!apiKey) {
    throw new Error(
      'YOUTUBE_API_KEY is not configured. Set a YouTube Data API key in the repository root .env so public video statistics can be read without widening the OAuth grant.',
    );
  }
  const session = await assertYouTubeSessionReady({
    fetchImpl,
    additionalScopes: [YOUTUBE_ANALYTICS_SCOPE],
  });
  const dataUrl = new URL(YOUTUBE_DATA_API);
  dataUrl.searchParams.set('part', 'statistics');
  dataUrl.searchParams.set('id', videoId);
  dataUrl.searchParams.set('key', apiKey);
  const dataResponse = await fetchImpl(dataUrl, {
    signal: AbortSignal.timeout(BROWSER_TIMEOUT_MS),
  });
  const dataPayload = (await dataResponse.json().catch(() => null)) as unknown;
  if (!dataResponse.ok) {
    throw new Error(
      `YouTube statistics failed with HTTP ${dataResponse.status}.${describeGoogleApiError(dataPayload)}`,
    );
  }
  const statistics = extractYouTubeStatistics(dataPayload, videoId);

  let analytics: {
    shares: number | null;
    subscribersGained: number | null;
    details: SocialPostMetricDetails;
  } = {
    shares: null,
    subscribersGained: null,
    details: {},
  };
  try {
    analytics = await fetchYouTubeAnalytics(
      post,
      videoId,
      session.accessToken,
      fetchImpl,
    );
  } catch {
    // Analytics can lag behind the Data API. Core public counters are still a
    // useful snapshot, so a delayed report must not discard them.
  }

  return {
    ...EMPTY_COUNTS,
    views: statistics.views,
    likes: statistics.likes,
    comments: statistics.comments,
    shares: analytics.shares,
    followersGained: analytics.subscribersGained,
    details: analytics.details,
  };
}

/**
 * A bare status code cannot tell an exhausted quota apart from a scope the
 * session never had: both answer 403. Google names the cause in the body, so the
 * reason travels with the thrown error instead of being parsed and dropped.
 */
function describeGoogleApiError(payload: unknown): string {
  if (!isRecord(payload) || !isRecord(payload['error'])) return '';
  const error = payload['error'];
  const errors = error['errors'];
  const reason =
    Array.isArray(errors) &&
    isRecord(errors[0]) &&
    typeof errors[0]['reason'] === 'string'
      ? errors[0]['reason']
      : null;
  const message =
    typeof error['message'] === 'string' ? error['message'] : null;
  const detail = [reason, message].filter((part) => part).join(': ');
  return detail ? ` ${detail}` : '';
}

export async function collectXMetrics(
  post: SocialPostRow,
  browser?: MetricsBrowserSession,
): Promise<SocialMetricCounts> {
  const url = post.post_url?.trim();
  if (!url) throw new Error(`X post ${post.id} has no post_url.`);

  return withPersistentPage(
    X_PROFILE_DIRECTORY,
    url,
    async (page) => {
      const article = page.locator('article[data-testid="tweet"]').first();
      await article.waitFor({ state: 'visible', timeout: BROWSER_TIMEOUT_MS });
      const comments = await readXButtonCount(
        article.locator('[data-testid="reply"]'),
      );
      const reposts = await readXButtonCount(
        article.locator('[data-testid="retweet"]'),
      );
      const likes = await readXButtonCount(
        article.locator('[data-testid="like"]'),
      );
      const views = await readFirstMetricNumber(
        article.locator('a[href$="/analytics"]'),
      );
      return {
        ...EMPTY_COUNTS,
        views,
        impressions: null,
        likes,
        comments,
        shares: reposts,
      };
    },
    browser,
  );
}

export async function inspectXPublishedPost(
  url: string,
): Promise<RecoveredPublishedPost> {
  const normalizedUrl = url.trim();
  if (!normalizedUrl)
    throw new Error('Cannot reconcile an X post without a URL.');
  const platformPostId = extractXPostId(normalizedUrl);
  if (!platformPostId) {
    throw new Error(`Cannot extract an X post id from ${normalizedUrl}.`);
  }

  return withPersistentPage(
    X_PROFILE_DIRECTORY,
    normalizedUrl,
    async (page) => {
      const article = page.locator('article[data-testid="tweet"]').first();
      await article.waitFor({ state: 'visible', timeout: BROWSER_TIMEOUT_MS });
      const publishedBody = (
        await article.locator('[data-testid="tweetText"]').first().innerText()
      ).trim();
      if (!publishedBody) {
        throw new Error(`X post ${platformPostId} has no readable body.`);
      }

      return {
        platformPostId,
        postUrl: normalizedUrl,
        publishedTitle: null,
        publishedBody,
        hashtags: [],
        videoDurationSec: null,
      };
    },
  );
}

export async function inspectXPublishedPostAt(
  publishedAt: string,
  profileUrl: string,
): Promise<RecoveredPublishedPost> {
  const target = Date.parse(publishedAt);
  if (Number.isNaN(target)) {
    throw new Error(
      `Cannot reconcile X post with invalid timestamp ${publishedAt}.`,
    );
  }
  const normalizedProfileUrl = profileUrl.trim();
  if (!normalizedProfileUrl) {
    throw new Error('Cannot reconcile X post without a profile URL.');
  }

  return withPersistentPage(
    X_PROFILE_DIRECTORY,
    normalizedProfileUrl,
    async (page) => {
      const articles = page.locator('article[data-testid="tweet"]');
      await articles.first().waitFor({
        state: 'visible',
        timeout: BROWSER_TIMEOUT_MS,
      });
      const count = await articles.count();
      let bestIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < count; index += 1) {
        const datetime = await articles
          .nth(index)
          .locator('time')
          .first()
          .getAttribute('datetime')
          .catch(() => null);
        const candidateTime = datetime ? Date.parse(datetime) : Number.NaN;
        if (Number.isNaN(candidateTime)) continue;
        const distance = Math.abs(candidateTime - target);
        if (distance < bestDistance) {
          bestIndex = index;
          bestDistance = distance;
        }
      }
      if (bestIndex < 0 || bestDistance > 30 * 60_000) {
        throw new Error(
          `No X post found within 30 minutes of ${publishedAt} on ${normalizedProfileUrl}.`,
        );
      }

      const article = articles.nth(bestIndex);
      const href = await article
        .locator('a[href*="/status/"]')
        .first()
        .getAttribute('href');
      const postUrl = href
        ? new URL(href, normalizedProfileUrl).toString()
        : '';
      const platformPostId = extractXPostId(postUrl);
      const publishedBody = (
        await article.locator('[data-testid="tweetText"]').first().innerText()
      ).trim();
      if (!platformPostId || !publishedBody) {
        throw new Error(
          `Matched X post near ${publishedAt}, but its id or body is unreadable.`,
        );
      }

      return {
        platformPostId,
        postUrl,
        publishedTitle: null,
        publishedBody,
        hashtags: [],
        videoDurationSec: null,
      };
    },
  );
}

export async function inspectRednotePublishedPost(
  publishedAt: string,
): Promise<RecoveredPublishedPost> {
  return withPersistentPage(
    REDNOTE_PROFILE_DIRECTORY,
    REDNOTE_MANAGER_URL,
    async (page) => {
      const cards = page.locator('.note-card');
      await cards.first().waitFor({
        state: 'visible',
        timeout: BROWSER_TIMEOUT_MS,
      });
      const card = await closestRednoteCardToTimestamp(
        cards,
        publishedAt,
        30 * 60_000,
      );
      const noteId = extractRednoteNoteId(
        await card.getAttribute('data-impression'),
      );
      if (!noteId) {
        throw new Error(
          `Rednote post at ${publishedAt} has no readable note id.`,
        );
      }
      const managerTitle = (
        (await card.locator('.note-card__title').textContent()) ?? ''
      ).trim();
      const videoDurationSec = parseClockDurationSeconds(
        await card
          .locator('.play_time')
          .textContent()
          .catch(() => null),
      );
      if (videoDurationSec === null || videoDurationSec <= 0) {
        throw new Error(
          `Rednote note ${noteId} has no readable video duration.`,
        );
      }

      await page.goto(
        `https://creator.rednote.com/publish/update?id=${encodeURIComponent(noteId)}&noteType=video`,
        { waitUntil: 'domcontentloaded', timeout: BROWSER_TIMEOUT_MS },
      );
      const editor = page.locator('[contenteditable="true"]').first();
      await editor.waitFor({ state: 'visible', timeout: BROWSER_TIMEOUT_MS });
      const editorText = (await editor.innerText()).trim();
      const parsed = parseRednoteEditorText(editorText);
      if (!parsed.body) {
        throw new Error(`Rednote note ${noteId} has no readable body.`);
      }
      const title = (
        await page
          .locator('input[placeholder="填写标题会有更多赞哦"]')
          .first()
          .inputValue()
          .catch(() => '')
      ).trim();

      return {
        platformPostId: noteId,
        postUrl: `https://www.xiaohongshu.com/explore/${noteId}`,
        // Older Rednote publisher runs left the dedicated title field empty.
        // The manager card still exposes a stable visible text label, which is
        // sufficient for a recovered telemetry row and is explicitly marked
        // as recovered in content_features by the reconciler.
        publishedTitle: title || managerTitle || parsed.body.slice(0, 20),
        publishedBody: parsed.body,
        hashtags: parsed.hashtags,
        videoDurationSec,
      };
    },
  );
}

export async function collectRednoteMetrics(
  post: SocialPostRow,
  onIdentity: (input: {
    post: SocialPostRow;
    platformPostId: string;
    postUrl: string;
  }) => Promise<void> = async () => {},
  browser?: MetricsBrowserSession,
  onReviewStatus: (input: {
    post: SocialPostRow;
    reviewStatus: SocialReviewStatus;
  }) => Promise<void> = async () => {},
): Promise<SocialMetricCounts> {
  return withPersistentPage(
    REDNOTE_PROFILE_DIRECTORY,
    REDNOTE_MANAGER_URL,
    async (page) => {
      await page.locator('.note-card').first().waitFor({
        state: 'visible',
        timeout: BROWSER_TIMEOUT_MS,
      });
      const card = await findRednoteCard(page, post);
      if (!card) return EMPTY_COUNTS;

      // Read the state before the numbers: a suppressed note still renders a
      // stat row of zeros, and recording those as a snapshot is what taught the
      // learner to avoid the hashtags of a post nobody was ever shown.
      // `under_review` is temporary, so a recovery back to `visible` is written
      // too — otherwise one moderation pass would exclude the post forever.
      const reviewStatus = detectRednoteReviewStatus(await card.innerText());
      if (reviewStatus !== post.review_status) {
        await onReviewStatus({ post, reviewStatus });
      }
      if (reviewStatus !== 'visible') return EMPTY_COUNTS;

      const stats = await card
        .locator('.note-card__stat')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.textContent?.trim() ?? ''),
        );
      if (stats.length < 5) {
        throw new Error(
          `Rednote note ${post.id} exposed only ${stats.length} statistics.`,
        );
      }
      const values = stats.slice(0, 5).map(parseMetricNumber);
      if (values.some((value) => value === null)) {
        throw new Error(
          `Rednote note ${post.id} contains an unreadable statistic.`,
        );
      }
      const [views, comments, likes, saves, shares] = values;
      if (
        views === undefined ||
        comments === undefined ||
        likes === undefined ||
        saves === undefined ||
        shares === undefined
      ) {
        throw new Error(
          `Rednote note ${post.id} did not expose five statistics.`,
        );
      }

      const impression = await card.getAttribute('data-impression');
      const noteId = extractRednoteNoteId(impression);
      if (noteId && post.platform_post_id !== noteId) {
        await onIdentity({
          post,
          platformPostId: noteId,
          postUrl: `https://www.xiaohongshu.com/explore/${noteId}`,
        });
      }

      return {
        ...EMPTY_COUNTS,
        views,
        comments,
        likes,
        saves,
        shares,
      };
    },
    browser,
  );
}

async function findRednoteCard(page: Page, post: SocialPostRow) {
  const cards = page.locator('.note-card');
  if (post.platform_post_id) {
    const count = await cards.count();
    for (let index = 0; index < count; index += 1) {
      const card = cards.nth(index);
      if (
        extractRednoteNoteId(await card.getAttribute('data-impression')) ===
        post.platform_post_id
      ) {
        return card;
      }
    }
    // A previously resolved note id that disappears from the published manager
    // can be under moderation or removed. Do not fabricate zero metrics and do
    // not timestamp-match it to a different card; surface "no metrics yet".
    return null;
  }

  const title = (post.published_title ?? post.generated_title)?.trim();
  if (title) {
    const matches = cards.filter({ hasText: title.slice(0, 20) });
    const count = await matches.count();
    if (count === 1) return matches.first();
    if (count > 1) return closestRednoteCard(matches, post);
  }

  // Older publisher runs could record the generated title even when Rednote
  // silently published a different/empty title. Timestamp matching repairs
  // those rows once, then the extracted noteId becomes the durable identity.
  return closestRednoteCard(cards, post, 30 * 60_000);
}

async function closestRednoteCard(
  cards: ReturnType<Page['locator']>,
  post: SocialPostRow,
  maxDistanceMs = Number.POSITIVE_INFINITY,
) {
  return closestRednoteCardToTimestamp(
    cards,
    post.published_at,
    maxDistanceMs,
    `Rednote note ${post.id}`,
  );
}

async function closestRednoteCardToTimestamp(
  cards: ReturnType<Page['locator']>,
  publishedAt: string,
  maxDistanceMs = Number.POSITIVE_INFINITY,
  label = 'Rednote post',
) {
  const target = new Date(publishedAt).getTime();
  if (Number.isNaN(target)) {
    throw new Error(`${label} has an invalid published_at.`);
  }

  const count = await cards.count();
  let best = cards.first();
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < count; index += 1) {
    const candidate = cards.nth(index);
    const raw = await candidate.locator('.note-card__time').textContent();
    const parsed = parseRednoteTime(raw);
    if (parsed === null) continue;
    const distance = Math.abs(parsed - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  if (bestDistance > maxDistanceMs) {
    throw new Error(
      `${label} could not be matched within ${maxDistanceMs / 60_000} minutes of its publish time.`,
    );
  }
  return best;
}

async function fetchYouTubeAnalytics(
  post: SocialPostRow,
  videoId: string,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<{
  shares: number | null;
  subscribersGained: number | null;
  details: SocialPostMetricDetails;
}> {
  const summary = await queryYouTubeAnalytics({
    post,
    videoId,
    accessToken,
    fetchImpl,
    metrics:
      'shares,subscribersGained,engagedViews,averageViewDuration,averageViewPercentage',
  });
  const row = firstAnalyticsRow(summary);
  const details: SocialPostMetricDetails = {};
  if (row) {
    const engagedViews = numeric(row[2]);
    const averageViewDurationSec = numeric(row[3]);
    const averageViewPercentage = numeric(row[4]);
    if (engagedViews !== null) details.engagedViews = engagedViews;
    if (averageViewDurationSec !== null)
      details.averageViewDurationSec = averageViewDurationSec;
    if (averageViewPercentage !== null)
      details.averageViewPercentage = averageViewPercentage / 100;
  }

  try {
    const demographics = await queryYouTubeAnalytics({
      post,
      videoId,
      accessToken,
      fetchImpl,
      metrics: 'viewerPercentage',
      dimensions: 'ageGroup,gender',
    });
    const parsed = parseYouTubeDemographics(demographics);
    if (parsed) details.audienceDemographics = parsed;
  } catch {
    // Demographic reports are privacy-thresholded and can be unavailable for
    // small audiences. Keep the snapshot useful without fabricating zeros.
  }

  try {
    const retention = await queryYouTubeAnalytics({
      post,
      videoId,
      accessToken,
      fetchImpl,
      metrics: 'audienceWatchRatio',
      dimensions: 'elapsedVideoTimeRatio',
    });
    const fiveSecondRetentionRate = findRetentionAtSeconds(
      retention,
      5,
      post.video_duration_sec,
    );
    if (fiveSecondRetentionRate !== null)
      details.fiveSecondRetentionRate = fiveSecondRetentionRate;
  } catch {
    // Audience-retention reports can lag behind public counters.
  }

  return {
    shares: row ? numeric(row[0]) : null,
    subscribersGained: row ? numeric(row[1]) : null,
    details,
  };
}

async function queryYouTubeAnalytics(input: {
  post: SocialPostRow;
  videoId: string;
  accessToken: string;
  fetchImpl: typeof fetch;
  metrics: string;
  dimensions?: string;
}): Promise<unknown> {
  const url = new URL(YOUTUBE_ANALYTICS_API);
  url.searchParams.set('ids', 'channel==MINE');
  url.searchParams.set('startDate', input.post.published_at.slice(0, 10));
  url.searchParams.set('endDate', new Date().toISOString().slice(0, 10));
  url.searchParams.set('metrics', input.metrics);
  url.searchParams.set('filters', `video==${input.videoId}`);
  if (input.dimensions) url.searchParams.set('dimensions', input.dimensions);

  const { ok, status, payload } = await fetchJsonWithTimeout(
    input.fetchImpl,
    url,
    { headers: { authorization: `Bearer ${input.accessToken}` } },
  );
  if (!ok) throw new Error(`YouTube Analytics failed with HTTP ${status}.`);
  if (!isRecord(payload) || !Array.isArray(payload['rows'])) {
    throw new Error('YouTube Analytics returned an invalid response.');
  }
  return payload;
}

function firstAnalyticsRow(payload: unknown): unknown[] | null {
  if (!isRecord(payload) || !Array.isArray(payload['rows'])) return null;
  const row = payload['rows'][0];
  return Array.isArray(row) ? row : null;
}

export function parseYouTubeDemographics(
  payload: unknown,
): SocialPostMetricDetails['audienceDemographics'] | null {
  if (!isRecord(payload) || !Array.isArray(payload['rows'])) return null;
  const gender: Record<string, number> = {};
  const age: Record<string, number> = {};
  let found = false;
  for (const row of payload['rows']) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const ageGroup = typeof row[0] === 'string' ? row[0] : null;
    const genderKey = typeof row[1] === 'string' ? row[1] : null;
    const percentage = numeric(row[2]);
    if (!ageGroup || !genderKey || percentage === null) continue;
    const fraction = percentage / 100;
    age[ageGroup] =
      Math.round(((age[ageGroup] ?? 0) + fraction) * 1_000_000) / 1_000_000;
    gender[genderKey] =
      Math.round(((gender[genderKey] ?? 0) + fraction) * 1_000_000) / 1_000_000;
    found = true;
  }
  return found ? { age, gender } : null;
}

export function findRetentionAtSeconds(
  payload: unknown,
  seconds: number,
  durationSeconds: number | null,
): number | null {
  if (
    !isRecord(payload) ||
    !Array.isArray(payload['rows']) ||
    durationSeconds === null ||
    durationSeconds <= 0
  ) {
    return null;
  }
  const targetRatio = Math.min(1, Math.max(0, seconds / durationSeconds));
  let best: { distance: number; value: number } | null = null;
  for (const row of payload['rows']) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const ratio = numeric(row[0]);
    const value = numeric(row[1]);
    if (ratio === null || value === null) continue;
    const distance = Math.abs(ratio - targetRatio);
    if (!best || distance < best.distance) best = { distance, value };
  }
  return best?.value ?? null;
}

function extractYouTubeStatistics(payload: unknown, videoId: string) {
  if (!isRecord(payload) || !Array.isArray(payload['items'])) {
    throw new Error('YouTube statistics returned an invalid response.');
  }
  const item = payload['items'].find(
    (candidate) => isRecord(candidate) && candidate['id'] === videoId,
  );
  if (!isRecord(item) || !isRecord(item['statistics'])) {
    throw new Error(
      `YouTube video ${videoId} was not returned by videos.list.`,
    );
  }
  const statistics = item['statistics'];
  return {
    views: parseMetricNumber(String(statistics['viewCount'] ?? '')),
    likes: parseMetricNumber(String(statistics['likeCount'] ?? '')),
    comments: parseMetricNumber(String(statistics['commentCount'] ?? '')),
  };
}

function extractInsightValue(item: Record<string, unknown>): number | null {
  const values = item['values'];
  if (Array.isArray(values) && values.length > 0 && isRecord(values[0])) {
    return numeric(values[0]['value']);
  }
  return numeric(item['value']);
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sumKnown(values: (number | undefined)[]): number | null {
  const known = values.filter((value): value is number => value !== undefined);
  return known.length > 0 ? known.reduce((sum, value) => sum + value, 0) : null;
}

function requirePlatformPostId(post: SocialPostRow): string {
  const value = post.platform_post_id?.trim();
  if (!value)
    throw new Error(
      `${post.platform} post ${post.id} has no platform_post_id.`,
    );
  return value;
}

async function readXButtonCount(
  locator: ReturnType<Page['locator']>,
): Promise<number | null> {
  const aria = await locator
    .first()
    .getAttribute('aria-label')
    .catch(() => null);
  const fromAria = parseFirstMetricNumber(aria);
  if (fromAria !== null) return fromAria;
  return readFirstMetricNumber(locator);
}

async function readFirstMetricNumber(
  locator: ReturnType<Page['locator']>,
): Promise<number | null> {
  const text = await locator
    .first()
    .innerText()
    .catch(() => '');
  return parseFirstMetricNumber(text);
}

export function parseFirstMetricNumber(value: string | null): number | null {
  if (!value) return null;
  const match = /[\d,.]+\s*(?:[KMB]|万|萬|億|亿)?/iu.exec(value);
  return match ? parseMetricNumber(match[0]) : null;
}

export function parseMetricNumber(raw: string): number | null {
  const normalized = raw.trim().replace(/,/gu, '').replace(/\s+/gu, '');
  const match = /^(\d+(?:\.\d+)?)([KMB]|万|萬|億|亿)?$/iu.exec(normalized);
  if (!match) return null;
  const base = Number(match[1]);
  const value = Math.round(base * metricMultiplier(match[2]));
  return Number.isSafeInteger(value) ? value : null;
}

function metricMultiplier(suffix: string | undefined): number {
  switch (suffix?.toUpperCase()) {
    case 'K':
      return 1_000;
    case 'M':
      return 1_000_000;
    case 'B':
      return 1_000_000_000;
    case '万':
    case '萬':
      return 10_000;
    case '億':
    case '亿':
      return 100_000_000;
    default:
      return 1;
  }
}

export function extractXPostId(url: string): string | null {
  const match = /\/status\/(\d+)(?:[/?#]|$)/u.exec(url);
  return match?.[1] ?? null;
}

export function parseClockDurationSeconds(raw: string | null): number | null {
  if (!raw) return null;
  const parts = raw
    .trim()
    .split(':')
    .map((part) => Number(part));
  if (
    (parts.length !== 2 && parts.length !== 3) ||
    parts.some((part) => !Number.isInteger(part) || part < 0)
  ) {
    return null;
  }
  const [first, second, third] = parts;
  if (first === undefined || second === undefined) return null;
  if (parts.length === 2) {
    if (second >= 60) return null;
    return first * 60 + second;
  }
  if (third === undefined || second >= 60 || third >= 60) return null;
  return first * 3_600 + second * 60 + third;
}

export function parseRednoteEditorText(raw: string): {
  body: string;
  hashtags: string[];
} {
  const normalized = raw.replace(/\r\n?/gu, '\n').trim();
  if (!normalized) return { body: '', hashtags: [] };

  const lines = normalized.split('\n');
  let lastContentIndex = lines.length - 1;
  while (lastContentIndex >= 0 && !lines[lastContentIndex]?.trim()) {
    lastContentIndex -= 1;
  }
  const trailingLine = lines[lastContentIndex]?.trim() ?? '';
  const tokens = trailingLine.split(/\s+/u).filter(Boolean);
  if (
    tokens.length === 0 ||
    tokens.some((token) => !token.startsWith('#') || token.length === 1)
  ) {
    return { body: normalized, hashtags: [] };
  }

  return {
    body: lines.slice(0, lastContentIndex).join('\n').trim(),
    hashtags: tokens.map((token) => token.slice(1)),
  };
}

export function extractRednoteNoteId(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (
      !isRecord(value) ||
      !isRecord(value['noteTarget']) ||
      !isRecord(value['noteTarget']['value'])
    )
      return null;
    const noteId = value['noteTarget']['value']['noteId'];
    return typeof noteId === 'string' && noteId.trim() ? noteId.trim() : null;
  } catch {
    return null;
  }
}

function parseRednoteTime(raw: string | null): number | null {
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/u.exec(raw.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const value = Date.parse(
    `${year}-${month}-${day}T${hour}:${minute}:00+08:00`,
  );
  return Number.isNaN(value) ? null : value;
}

/**
 * One persistent Chrome context per browser profile for the lifetime of a
 * metrics sweep, with a fresh page per post. Launching and tearing down Chrome
 * per post paid the browser startup cost once per row, and a persistent profile
 * cannot be opened twice, so the sweep owns the context and every post that
 * needs the same profile reuses it.
 */
export interface MetricsBrowserSession {
  withPage<T>(
    profileDirectory: string,
    url: string,
    run: (page: Page) => Promise<T>,
  ): Promise<T>;
  /**
   * The same signed-in profile without rendering a page. A reading that a
   * server already puts in its response -- an API payload, or a count embedded
   * in server-rendered HTML -- needs the profile's cookies, not its DOM.
   */
  withRequest<T>(
    profileDirectory: string,
    run: (request: APIRequestContext) => Promise<T>,
  ): Promise<T>;
  close(): Promise<void>;
}

export function createMetricsBrowserSession(): MetricsBrowserSession {
  const contexts = new Map<string, BrowserContext>();

  async function contextFor(profileDirectory: string): Promise<BrowserContext> {
    let context = contexts.get(profileDirectory);
    if (!context) {
      context = await chromium.launchPersistentContext(profileDirectory, {
        channel: 'chrome',
        headless: true,
        viewport: { width: 1440, height: 900 },
      });
      contexts.set(profileDirectory, context);
    }
    return context;
  }

  return {
    async withPage(profileDirectory, url, run) {
      const context = await contextFor(profileDirectory);
      const page = await context.newPage();
      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: BROWSER_TIMEOUT_MS,
        });
        return await run(page);
      } finally {
        await page.close();
      }
    },
    async withRequest(profileDirectory, run) {
      const context = await contextFor(profileDirectory);
      return run(context.request);
    },
    async close() {
      const open = [...contexts.values()];
      contexts.clear();
      let failure: unknown;
      for (const context of open) {
        try {
          await context.close();
        } catch (error) {
          failure ??= error;
        }
      }
      if (failure !== undefined) throw toError(failure);
    },
  };
}

async function withPersistentPage<T>(
  profileDirectory: string,
  url: string,
  run: (page: Page) => Promise<T>,
  browser?: MetricsBrowserSession,
): Promise<T> {
  if (browser) return browser.withPage(profileDirectory, url, run);

  const session = createMetricsBrowserSession();
  try {
    return await session.withPage(profileDirectory, url, run);
  } finally {
    await session.close();
  }
}
