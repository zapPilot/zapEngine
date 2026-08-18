import type { SocialPostMetricRow, SocialPostRow } from '../types.js';
import {
  activateSocialStrategy,
  getActiveSocialStrategies,
  listLearningSocialMetrics,
  listLearningSocialPosts,
  type SocialPublishSlot,
  type SocialStrategyConfig,
  type SocialStrategyVersionRow,
} from './daemon-store.js';
import { SOCIAL_PLATFORMS, type SocialPlatform } from './platforms.js';

const LEARNING_DAYS = 60;
const MIN_PLATFORM_SAMPLES = 5;
const MIN_VARIANT_SAMPLES = 2;
const JST_OFFSET_HOURS = 9;

const DEFAULT_PUBLISH_SLOTS_JST: readonly SocialPublishSlot[] = [
  { hour: 9, minute: 30 },
  { hour: 12, minute: 0 },
  { hour: 14, minute: 30 },
  { hour: 17, minute: 0 },
];

export function defaultSocialStrategy(): SocialStrategyConfig {
  return {
    publishSlotsJst: [...DEFAULT_PUBLISH_SLOTS_JST],
    explorationRate: 0.2,
  };
}

export function activeStrategyMap(
  rows: readonly SocialStrategyVersionRow[],
): Record<SocialPlatform, SocialStrategyVersionRow | null> {
  return Object.fromEntries(
    SOCIAL_PLATFORMS.map((platform) => [
      platform,
      rows.find((row) => row.platform === platform) ?? null,
    ]),
  ) as Record<SocialPlatform, SocialStrategyVersionRow | null>;
}

export function nextPublishSlot(input: {
  platform: SocialPlatform;
  readyAt: Date;
  after?: Date;
  config?: SocialStrategyConfig;
}): Date {
  const config = input.config ?? defaultSocialStrategy();
  const slots = normalizePublishSlots(config.publishSlotsJst);
  const floor = new Date(
    Math.max(input.readyAt.getTime(), input.after?.getTime() ?? 0),
  );
  const floorJstMs = floor.getTime() + JST_OFFSET_HOURS * 60 * 60_000;
  const floorJst = new Date(floorJstMs);

  for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
    for (const slot of slots) {
      const candidateJstMs = Date.UTC(
        floorJst.getUTCFullYear(),
        floorJst.getUTCMonth(),
        floorJst.getUTCDate() + dayOffset,
        slot.hour,
        slot.minute,
        0,
        0,
      );
      const candidate = new Date(
        candidateJstMs - JST_OFFSET_HOURS * 60 * 60_000,
      );
      if (candidate.getTime() >= floor.getTime()) return candidate;
    }
  }

  throw new Error(`Could not find a publish slot for ${input.platform}.`);
}

function normalizePublishSlots(
  slots: readonly SocialPublishSlot[] | undefined,
): SocialPublishSlot[] {
  const seen = new Set<string>();
  const normalized: SocialPublishSlot[] = [];
  for (const slot of slots ?? []) {
    if (
      !Number.isInteger(slot.hour) ||
      slot.hour < 0 ||
      slot.hour > 23 ||
      !Number.isInteger(slot.minute) ||
      slot.minute < 0 ||
      slot.minute > 59
    ) {
      continue;
    }
    const key = `${slot.hour}:${slot.minute}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(slot);
  }
  normalized.sort((a, b) => a.hour - b.hour || a.minute - b.minute);
  return normalized.length ? normalized : [...DEFAULT_PUBLISH_SLOTS_JST];
}

export function buildStrategyGuidance(
  platform: SocialPlatform,
  config: SocialStrategyConfig | undefined,
): string | undefined {
  if (!config) return undefined;
  const lines: string[] = [];
  if (config.preferredHookTypes?.length) {
    lines.push(
      `Prefer these historically strong hook types when they genuinely fit the episode: ${config.preferredHookTypes.join(', ')}.`,
    );
  }
  if (platform === 'rednote' && config.preferredHashtags?.length) {
    lines.push(
      `Prefer relevant hashtags from this historically strong pool: ${config.preferredHashtags.join(', ')}. Do not force an irrelevant tag.`,
    );
  }
  if (platform === 'rednote' && config.avoidHashtags?.length) {
    lines.push(
      `Avoid these historically weak hashtags unless they are essential to the topic: ${config.avoidHashtags.join(', ')}.`,
    );
  }
  return lines.length ? lines.join('\n') : undefined;
}

export interface LearnedStrategy {
  platform: SocialPlatform;
  config: SocialStrategyConfig;
  basedOnSamples: number;
}

export function learnSocialStrategies(input: {
  posts: readonly SocialPostRow[];
  metrics: readonly SocialPostMetricRow[];
}): LearnedStrategy[] {
  const postById = new Map(input.posts.map((post) => [post.id, post]));
  const samples = input.metrics
    .filter((metric) => metric.measurement_window === '24h')
    .map((metric) => ({ metric, post: postById.get(metric.social_post_id) }))
    .filter(
      (
        sample,
      ): sample is { metric: SocialPostMetricRow; post: SocialPostRow } =>
        sample.post !== undefined && sample.metric.views !== null,
    );

  return SOCIAL_PLATFORMS.flatMap((platform) => {
    const platformSamples = samples.filter(
      (sample) => sample.post.platform === platform,
    );
    if (platformSamples.length < MIN_PLATFORM_SAMPLES) return [];

    const medianViews = median(
      platformSamples.map((sample) => sample.metric.views ?? 0),
    );
    const scored = platformSamples.map((sample) => ({
      ...sample,
      score: scoreSample(sample.metric, medianViews),
    }));
    const config = defaultSocialStrategy();
    config.preferredHookTypes = topVariants(
      scored,
      (sample) => sample.post.hook_type,
      2,
    );

    if (platform === 'rednote') {
      const tagScores = new Map<string, number[]>();
      for (const sample of scored) {
        for (const tag of sample.post.hashtags) {
          const values = tagScores.get(tag) ?? [];
          values.push(sample.score);
          tagScores.set(tag, values);
        }
      }
      const rankedTags = [...tagScores.entries()]
        .filter(([, values]) => values.length >= MIN_VARIANT_SAMPLES)
        .map(([tag, values]) => ({ tag, score: average(values) }))
        .sort((a, b) => b.score - a.score);
      config.preferredHashtags = rankedTags.slice(0, 8).map((row) => row.tag);
      config.avoidHashtags = rankedTags
        .slice(-5)
        .filter((row) => row.score < 0.8)
        .map((row) => row.tag);
    }

    return [{ platform, config, basedOnSamples: platformSamples.length }];
  });
}

export async function refreshSocialStrategies(input: {
  now: Date;
  log?: (message: string) => void;
}): Promise<void> {
  const log = input.log ?? (() => void 0);
  const cutoff = new Date(
    input.now.getTime() - LEARNING_DAYS * 24 * 60 * 60_000,
  ).toISOString();
  const [posts, metrics, active] = await Promise.all([
    listLearningSocialPosts(cutoff),
    listLearningSocialMetrics(cutoff),
    getActiveSocialStrategies(),
  ]);
  const activeByPlatform = activeStrategyMap(active);

  for (const learned of learnSocialStrategies({ posts, metrics })) {
    const current = activeByPlatform[learned.platform];
    if (current && sameStrategy(current.config, learned.config)) continue;
    const version = await activateSocialStrategy({
      platform: learned.platform,
      config: learned.config,
      basedOnSamples: learned.basedOnSamples,
      now: input.now,
    });
    log(
      `[strategy] ${learned.platform} activated v${version.version} from ${learned.basedOnSamples} 24h samples.`,
    );
  }
}

function scoreSample(metric: SocialPostMetricRow, medianViews: number): number {
  const views = metric.views ?? 0;
  let reach = 0;
  if (medianViews > 0) {
    reach = views / medianViews;
  } else if (views > 0) {
    reach = 1;
  }
  const engagements = [
    metric.likes,
    metric.comments,
    metric.shares,
    metric.saves,
  ]
    .filter((value): value is number => value !== null)
    .reduce((sum, value) => sum + value, 0);
  const engagementRate = views > 0 ? engagements / views : 0;
  const retention = metric.details.fiveSecondRetentionRate ?? 0;
  return (
    reach * 0.75 + Math.min(1, engagementRate * 20) * 0.15 + retention * 0.1
  );
}

function topVariants<T extends { score: number }>(
  samples: readonly T[],
  keyOf: (sample: T) => string,
  limit: number,
): string[] {
  const grouped = new Map<string, number[]>();
  for (const sample of samples) {
    const key = keyOf(sample);
    const values = grouped.get(key) ?? [];
    values.push(sample.score);
    grouped.set(key, values);
  }
  return [...grouped.entries()]
    .filter(([, values]) => values.length >= MIN_VARIANT_SAMPLES)
    .map(([key, values]) => ({ key, score: average(values) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.key);
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function sameStrategy(
  a: SocialStrategyConfig,
  b: SocialStrategyConfig,
): boolean {
  return (
    JSON.stringify(canonicalStrategy(a)) ===
    JSON.stringify(canonicalStrategy(b))
  );
}

function canonicalStrategy(config: SocialStrategyConfig): SocialStrategyConfig {
  return {
    ...(config.publishSlotsJst
      ? {
          publishSlotsJst: [...config.publishSlotsJst].sort(
            (a, b) => a.hour - b.hour || a.minute - b.minute,
          ),
        }
      : {}),
    ...(config.preferredHookTypes
      ? { preferredHookTypes: [...config.preferredHookTypes].sort() }
      : {}),
    ...(config.preferredHashtags
      ? { preferredHashtags: [...config.preferredHashtags].sort() }
      : {}),
    ...(config.avoidHashtags
      ? { avoidHashtags: [...config.avoidHashtags].sort() }
      : {}),
    ...(config.explorationRate !== undefined
      ? { explorationRate: config.explorationRate }
      : {}),
  };
}
