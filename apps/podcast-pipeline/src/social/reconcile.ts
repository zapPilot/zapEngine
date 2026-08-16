import { insertSocialPost } from '../services/db.js';
import type { NewSocialPost, SocialPostRow } from '../types.js';
import {
  inspectRednotePublishedPost,
  inspectXPublishedPost,
  inspectXPublishedPostAt,
  type RecoveredPublishedPost,
} from './metric-collectors.js';
import { platformLabel } from './platforms.js';
import { buildContentFeatures } from './record.js';
import { readPublishState } from './state.js';
import {
  type PlatformPublishState,
  SOCIAL_STATE_LANGUAGE_KEY,
  type SocialHookType,
  type SocialPlatform,
  type SocialPublishState,
  type SocialTopic,
} from './types.js';

const RECONCILABLE_PLATFORMS = [
  'x',
  'rednote',
] as const satisfies readonly SocialPlatform[];
const STATE_MATCH_TOLERANCE_MS = 5 * 60_000;

export interface ReconcileRecentSocialPostsDependencies {
  readState?: typeof readPublishState;
  insertPost?: typeof insertSocialPost;
  inspectX?: typeof inspectXPublishedPost;
  inspectXAt?: typeof inspectXPublishedPostAt;
  inspectRednote?: typeof inspectRednotePublishedPost;
}

interface ReconcileCandidate {
  episodeId: string;
  platform: (typeof RECONCILABLE_PLATFORMS)[number];
  published: PlatformPublishState;
}

export async function reconcileRecentSocialPosts(input: {
  posts: readonly SocialPostRow[];
  publishedSince: string;
  log: (message: string) => void;
  dependencies?: ReconcileRecentSocialPostsDependencies;
}): Promise<SocialPostRow[]> {
  const cutoffMs = Date.parse(input.publishedSince);
  if (Number.isNaN(cutoffMs)) {
    throw new Error(
      `Invalid social reconciliation cutoff: ${input.publishedSince}`,
    );
  }

  const dependencies = input.dependencies ?? {};
  const state = await (dependencies.readState ?? readPublishState)();
  const posts = [...input.posts];
  const xProfileUrl = findXProfileUrl(state);
  let repaired = 0;
  let unresolved = 0;

  for (const candidate of recentStateCandidates(state, cutoffMs)) {
    const outcome = await reconcileCandidate({
      candidate,
      posts,
      dependencies,
      xProfileUrl,
      log: input.log,
    });
    repaired += outcome === 'repaired' ? 1 : 0;
    unresolved += outcome === 'unresolved' ? 1 : 0;
  }

  if (repaired || unresolved) {
    input.log(
      `Social telemetry reconciliation: ${repaired} repaired${unresolved ? `, ${unresolved} unresolved` : ''}.`,
    );
  }

  return posts.sort(
    (left, right) =>
      Date.parse(right.published_at) - Date.parse(left.published_at),
  );
}

function recentStateCandidates(
  state: SocialPublishState,
  cutoffMs: number,
): ReconcileCandidate[] {
  const candidates: ReconcileCandidate[] = [];
  for (const [episodeId, episodeState] of Object.entries(state)) {
    const languageState = episodeState[SOCIAL_STATE_LANGUAGE_KEY];
    if (!languageState) continue;

    for (const platform of RECONCILABLE_PLATFORMS) {
      const published = languageState[platform];
      if (published && isRecentState(published, cutoffMs)) {
        candidates.push({ episodeId, platform, published });
      }
    }
  }
  return candidates;
}

async function reconcileCandidate(input: {
  candidate: ReconcileCandidate;
  posts: SocialPostRow[];
  dependencies: ReconcileRecentSocialPostsDependencies;
  xProfileUrl: string | null;
  log: (message: string) => void;
}): Promise<'repaired' | 'unresolved' | 'skipped'> {
  const { episodeId, platform, published } = input.candidate;
  if (hasRecordedPost(input.posts, episodeId, platform, published)) {
    return 'skipped';
  }

  try {
    const discovered = await inspectPublishedPost({
      platform,
      published,
      dependencies: input.dependencies,
      xProfileUrl: input.xProfileUrl,
    });
    const sibling = input.posts.find((post) => post.episode_id === episodeId);
    const recovered = buildRecoveredSocialPost({
      episodeId,
      platform,
      published,
      discovered,
      ...(sibling ? { sibling } : {}),
    });
    const inserted = await (input.dependencies.insertPost ?? insertSocialPost)(
      recovered,
    );
    input.posts.push(inserted);
    const taxonomySource = sibling ? 'sibling taxonomy' : 'inferred taxonomy';
    input.log(
      `✓ Reconciled missing ${platformLabel(platform)} telemetry for episode ${episodeId} (${discovered.platformPostId}, ${taxonomySource}).`,
    );
    return 'repaired';
  } catch (error) {
    input.log(
      `✗ Could not reconcile ${platformLabel(platform)} for episode ${episodeId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 'unresolved';
  }
}

export function buildRecoveredSocialPost(input: {
  episodeId: string;
  platform: 'x' | 'rednote';
  published: PlatformPublishState;
  discovered: RecoveredPublishedPost;
  sibling?: SocialPostRow;
}): NewSocialPost {
  const title =
    input.platform === 'rednote' ? input.discovered.publishedTitle : null;
  if (input.platform === 'rednote' && !title?.trim()) {
    throw new Error(
      'Recovered Rednote telemetry requires a visible title label.',
    );
  }
  if (
    input.platform === 'rednote' &&
    (input.discovered.videoDurationSec === null ||
      input.discovered.videoDurationSec <= 0)
  ) {
    throw new Error(
      'Recovered Rednote telemetry requires a positive video duration.',
    );
  }

  const hashtags =
    input.platform === 'rednote' ? input.discovered.hashtags : [];
  const contentFeatures = buildContentFeatures({
    title,
    body: input.discovered.publishedBody,
    hashtags,
  });
  const taxonomy = input.sibling
    ? { topic: input.sibling.topic, hookType: input.sibling.hook_type }
    : inferRecoveredTaxonomy(input.discovered.publishedBody);

  return {
    episodeId: input.episodeId,
    platform: input.platform,
    postUrl: input.discovered.postUrl,
    platformPostId: input.discovered.platformPostId,
    publishedAt: input.published.publishedAt,
    topic: taxonomy.topic,
    hookType: taxonomy.hookType,
    generatedTitle: title,
    publishedTitle: title,
    // The original generation payload was lost with the failed telemetry write.
    // Keep the live platform copy instead of inventing a second version, and mark
    // the row so later copy-attribution code can exclude it while still learning
    // from its exact platform metrics and Rednote hashtags.
    generatedBody: input.discovered.publishedBody,
    publishedBody: input.discovered.publishedBody,
    hashtags,
    videoDurationSec: input.discovered.videoDurationSec,
    contentFeatures: {
      ...contentFeatures,
      telemetryRecovered: true,
    },
    llmModel: input.sibling?.llm_model ?? null,
  };
}

export function inferRecoveredTaxonomy(body: string): {
  topic: SocialTopic;
  hookType: SocialHookType;
} {
  return {
    topic: inferRecoveredTopic(body),
    hookType: inferRecoveredHookType(body),
  };
}

function inferRecoveredTopic(body: string): SocialTopic {
  const normalized = body.toLowerCase();
  if (normalized.includes('eip-')) return 'eth';
  const keywordGroups: readonly [SocialTopic, readonly string[]][] = [
    ['stablecoin', ['穩定幣', '稳定币', 'usdc', 'usdt', 'dai']],
    [
      'defi',
      ['defi', 'dex', '質押', '质押', 'staking', 'lido', 'liquidity pool'],
    ],
    ['btc', ['比特幣', '比特币', 'bitcoin', 'btc']],
    ['eth', ['以太坊', 'ethereum', 'eth']],
    [
      'macro',
      [
        '美聯儲',
        '美联储',
        '聯準會',
        '联准会',
        'federal reserve',
        'fed ',
        '利率',
        'cpi',
      ],
    ],
    [
      'market_event',
      ['upbit', 'bithumb', '交易所', '上幣', '上币', '被禁', '禁止交易'],
    ],
    [
      'traditional_finance',
      ['標普', '标普', 's&p', 'nasdaq', '納斯達克', '纳斯达克', '股市', '股票'],
    ],
    [
      'technology',
      ['人工智慧', '人工智能', 'ai ', 'gpu', '大模型', 'claude', 'manus'],
    ],
  ];

  return (
    keywordGroups.find(([, keywords]) =>
      keywords.some((keyword) => normalized.includes(keyword)),
    )?.[0] ?? 'market_event'
  );
}

function inferRecoveredHookType(body: string): SocialHookType {
  if (/[?？]/u.test(body)) return 'question';
  if (/[0-9０-９]/u.test(body)) return 'surprising_number';
  return 'explainer';
}

function isRecentState(
  published: PlatformPublishState,
  cutoffMs: number,
): boolean {
  const publishedAtMs = Date.parse(published.publishedAt);
  return !Number.isNaN(publishedAtMs) && publishedAtMs >= cutoffMs;
}

function hasRecordedPost(
  posts: readonly SocialPostRow[],
  episodeId: string,
  platform: 'x' | 'rednote',
  published: PlatformPublishState,
): boolean {
  const expectedTime = Date.parse(published.publishedAt);
  return posts.some((post) => {
    if (post.episode_id !== episodeId || post.platform !== platform)
      return false;
    if (published.url && post.post_url === published.url) return true;
    const actualTime = Date.parse(post.published_at);
    return (
      !Number.isNaN(expectedTime) &&
      !Number.isNaN(actualTime) &&
      Math.abs(actualTime - expectedTime) <= STATE_MATCH_TOLERANCE_MS
    );
  });
}

export function findXProfileUrl(state: SocialPublishState): string | null {
  for (const episodeState of Object.values(state)) {
    const url = episodeState[SOCIAL_STATE_LANGUAGE_KEY]?.x?.url?.trim();
    if (!url) continue;
    try {
      const parsed = new URL(url);
      const match = /^\/([^/]+)\/status\/\d+/u.exec(parsed.pathname);
      if (match?.[1]) return `${parsed.origin}/${match[1]}`;
    } catch {
      continue;
    }
  }
  return null;
}

async function inspectPublishedPost(input: {
  platform: 'x' | 'rednote';
  published: PlatformPublishState;
  dependencies: ReconcileRecentSocialPostsDependencies;
  xProfileUrl: string | null;
}): Promise<RecoveredPublishedPost> {
  if (input.platform === 'x') {
    const url = input.published.url?.trim();
    if (url) return (input.dependencies.inspectX ?? inspectXPublishedPost)(url);
    if (!input.xProfileUrl) {
      throw new Error(
        'local publish state has no X URL or discoverable X profile.',
      );
    }
    return (input.dependencies.inspectXAt ?? inspectXPublishedPostAt)(
      input.published.publishedAt,
      input.xProfileUrl,
    );
  }
  return (input.dependencies.inspectRednote ?? inspectRednotePublishedPost)(
    input.published.publishedAt,
  );
}
