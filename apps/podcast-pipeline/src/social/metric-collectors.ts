import { chromium, type Page } from 'playwright-core';

import { isPlainRecord as isRecord } from '../lib/typeGuards.js';
import type { SocialPostMetricDetails, SocialPostRow } from '../types.js';
import type { CollectedSocialMetrics, SocialMetricCounts } from './metrics.js';
import { PROFILE_DIRECTORY as REDNOTE_PROFILE_DIRECTORY } from './rednote-browser.js';
import {
  assertThreadsSessionReady,
  THREADS_INSIGHTS_SCOPE,
} from './threads-auth.js';
import type { SocialPlatform } from './types.js';
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
  fetchImpl?: typeof fetch;
  onRednoteIdentity?: (input: {
    post: SocialPostRow;
    platformPostId: string;
    postUrl: string;
  }) => Promise<void>;
}): Record<SocialPlatform, SocialMetricCollector> {
  const fetchImpl = input?.fetchImpl ?? fetch;
  return {
    threads: (post) => collectThreadsMetrics(post, fetchImpl),
    youtube: (post) => collectYouTubeMetrics(post, fetchImpl),
    x: collectXMetrics,
    rednote: (post) =>
      collectRednoteMetrics(post, input?.onRednoteIdentity ?? (async () => {})),
  };
}

async function fetchJson(
  url: URL,
  fetchImpl: typeof fetch,
  init: { headers?: Record<string, string> } = {},
): Promise<{ response: Response; payload: unknown }> {
  const response = await fetchImpl(url, {
    ...init,
    signal: AbortSignal.timeout(BROWSER_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  return { response, payload };
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

  const { response, payload } = await fetchJson(url, fetchImpl);
  if (!response.ok) {
    throw new Error(`Threads insights failed with HTTP ${response.status}.`);
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

export async function collectYouTubeMetrics(
  post: SocialPostRow,
  fetchImpl: typeof fetch = fetch,
): Promise<CollectedSocialMetrics> {
  const videoId = requirePlatformPostId(post);
  const session = await assertYouTubeSessionReady({
    fetchImpl,
    additionalScopes: [YOUTUBE_ANALYTICS_SCOPE],
  });
  const dataUrl = new URL(YOUTUBE_DATA_API);
  dataUrl.searchParams.set('part', 'statistics');
  dataUrl.searchParams.set('id', videoId);
  const { response: dataResponse, payload: dataPayload } = await fetchJson(
    dataUrl,
    fetchImpl,
    { headers: { authorization: `Bearer ${session.accessToken}` } },
  );
  if (!dataResponse.ok) {
    throw new Error(
      `YouTube statistics failed with HTTP ${dataResponse.status}.`,
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

export async function collectXMetrics(
  post: SocialPostRow,
): Promise<SocialMetricCounts> {
  const url = post.post_url?.trim();
  if (!url) throw new Error(`X post ${post.id} has no post_url.`);

  return withPersistentPage(X_PROFILE_DIRECTORY, url, async (page) => {
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
  });
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

  const { response, payload } = await fetchJson(url, input.fetchImpl, {
    headers: { authorization: `Bearer ${input.accessToken}` },
  });
  if (!response.ok)
    throw new Error(`YouTube Analytics failed with HTTP ${response.status}.`);
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
  const match = /[\d,.]+\s*(?:[KMB]|万|億)?/iu.exec(value);
  return match ? parseMetricNumber(match[0]) : null;
}

export function parseMetricNumber(raw: string): number | null {
  const normalized = raw.trim().replace(/,/gu, '').replace(/\s+/gu, '');
  const match = /^(\d+(?:\.\d+)?)([KMB]|万|億)?$/iu.exec(normalized);
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
      return 10_000;
    case '億':
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

async function withPersistentPage<T>(
  profileDirectory: string,
  url: string,
  run: (page: Page) => Promise<T>,
): Promise<T> {
  const context = await chromium.launchPersistentContext(profileDirectory, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 },
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: BROWSER_TIMEOUT_MS,
    });
    return await run(page);
  } finally {
    await context.close();
  }
}
