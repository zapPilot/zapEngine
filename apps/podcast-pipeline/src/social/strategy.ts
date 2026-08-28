import {
  type PrimaryLanguageCode,
  type SocialPostMetricRow,
  type SocialPostRow,
  SUPPORTED_PRIMARY_LANGUAGE_CODES,
} from '../types.js';
import {
  activateSocialStrategy,
  getActiveSocialStrategies,
  listLearningSocialMetrics,
  listLearningSocialPosts,
  type SocialPublishSlot,
  type SocialStrategyConfig,
  type SocialStrategyVersionRow,
} from './daemon-store.js';
import { deterministicBucket } from './experiments.js';
import { laneLabel } from './log-format.js';
import { SOCIAL_PLATFORMS, type SocialPlatform } from './platforms.js';
import { median } from './statistics.js';
import type { SocialReviewStatus } from './types.js';

const LEARNING_DAYS = 60;
const SUPPRESSED_REVIEW_STATUSES: readonly SocialReviewStatus[] = [
  'under_review',
  'rejected',
  'self_only',
];
const REDNOTE_MIN_LEARNABLE_VIEWS = 1;
const MIN_PLATFORM_SAMPLES = 5;
const MIN_VARIANT_SAMPLES = 2;
const JST_OFFSET_HOURS = 9;

const SCHEDULING_BASELINES: Record<
  SocialPlatform,
  Pick<
    SocialStrategyConfig,
    'publishSlotsJst' | 'dailyPublishCap' | 'slotExplorationRate'
  >
> = {
  rednote: {
    dailyPublishCap: 1,
    // First slot is the exploitation choice. The second is the 20% explorer.
    publishSlotsJst: [
      { hour: 14, minute: 30 },
      { hour: 12, minute: 0 },
    ],
    slotExplorationRate: 0.2,
  },
  threads: {
    dailyPublishCap: 1,
    // Evidence is still flat, so keep a clean 50/50 timing experiment.
    publishSlotsJst: [
      { hour: 12, minute: 0 },
      { hour: 9, minute: 30 },
    ],
    slotExplorationRate: 0.5,
  },
  x: {
    dailyPublishCap: 2,
    publishSlotsJst: [
      { hour: 12, minute: 15 },
      { hour: 17, minute: 0 },
    ],
    slotExplorationRate: 0,
  },
  youtube: {
    dailyPublishCap: 1,
    publishSlotsJst: [{ hour: 17, minute: 15 }],
    slotExplorationRate: 0,
  },
};

export function defaultSocialStrategy(
  platform: SocialPlatform = 'x',
): SocialStrategyConfig {
  const baseline = SCHEDULING_BASELINES[platform];
  return {
    publishSlotsJst: [...(baseline.publishSlotsJst ?? [])],
    dailyPublishCap: baseline.dailyPublishCap,
    slotExplorationRate: baseline.slotExplorationRate,
    explorationRate: 0.2,
  };
}

/**
 * Active rows created before daily caps existed still contain the legacy four
 * slots. Treat those rows as copy-learning only; once a version contains a cap,
 * the DB owns the scheduling fields too. This makes the migration safe without
 * creating a second hard-coded source of truth forever.
 */
export function effectiveSocialStrategy(
  platform: SocialPlatform,
  config: SocialStrategyConfig | undefined,
): SocialStrategyConfig {
  const baseline = defaultSocialStrategy(platform);
  if (!config) return baseline;
  if (config.dailyPublishCap === undefined) {
    return {
      ...config,
      publishSlotsJst: baseline.publishSlotsJst,
      dailyPublishCap: baseline.dailyPublishCap,
      slotExplorationRate: baseline.slotExplorationRate,
    };
  }
  return {
    ...baseline,
    ...config,
    publishSlotsJst: config.publishSlotsJst?.length
      ? [...config.publishSlotsJst]
      : baseline.publishSlotsJst,
  };
}

export function activeStrategyMap(
  rows: readonly SocialStrategyVersionRow[],
): Record<string, SocialStrategyVersionRow | null> {
  const map: Record<string, SocialStrategyVersionRow | null> = {};
  for (const platform of SOCIAL_PLATFORMS) {
    for (const languageCode of SUPPORTED_PRIMARY_LANGUAGE_CODES) {
      map[strategyMapKey(platform, languageCode)] =
        rows.find(
          (row) =>
            row.platform === platform &&
            (row.language_code ?? 'zh-Hant') === languageCode,
        ) ?? null;
    }
    map[platform] = map[strategyMapKey(platform, 'zh-Hant')] ?? null;
  }
  return map;
}

export function strategyMapKey(
  platform: SocialPlatform,
  languageCode: PrimaryLanguageCode,
): string {
  return `${platform}|${languageCode}`;
}

export function startOfJstDay(date: Date): Date {
  const jst = new Date(date.getTime() + JST_OFFSET_HOURS * 60 * 60_000);
  const dayStartJstMs = Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  return new Date(dayStartJstMs - JST_OFFSET_HOURS * 60 * 60_000);
}

export function nextPublishSlot(input: {
  platform: SocialPlatform;
  readyAt: Date;
  after?: Date;
  config?: SocialStrategyConfig;
}): Date {
  const config = effectiveSocialStrategy(input.platform, input.config);
  const slots = normalizePublishSlots(
    config.publishSlotsJst,
    defaultSocialStrategy(input.platform).publishSlotsJst,
  );
  return nextSlotFromChoices(input.platform, input.readyAt, input.after, slots);
}

/**
 * Schedule one `(episode, platform)` cohort while enforcing the platform's
 * daily budget. `existingSchedules` contains one timestamp per already-scheduled
 * platform cohort, regardless of language lane, so multiple languages cannot
 * consume the budget twice.
 */
export function nextPlatformPublishSlot(input: {
  platform: SocialPlatform;
  episodeId: string;
  readyAt: Date;
  after?: Date;
  existingSchedules: readonly Date[];
  config?: SocialStrategyConfig;
}): Date {
  const config = effectiveSocialStrategy(input.platform, input.config);
  const dailyCap = normalizeDailyCap(config.dailyPublishCap);
  const configured = normalizePublishSlots(
    config.publishSlotsJst,
    defaultSocialStrategy(input.platform).publishSlotsJst,
    false,
  );
  const slots = slotsForEpisode(input.platform, input.episodeId, configured, config);
  const floor = new Date(
    Math.max(input.readyAt.getTime(), input.after?.getTime() ?? 0),
  );
  const floorDay = startOfJstDay(floor);

  for (let dayOffset = 0; dayOffset < 90; dayOffset += 1) {
    const dayStart = new Date(
      floorDay.getTime() + dayOffset * 24 * 60 * 60_000,
    );
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
    const used = input.existingSchedules.filter(
      (date) => date >= dayStart && date < dayEnd,
    ).length;
    if (used >= dailyCap) continue;

    const candidates = [...slots]
      .sort((a, b) => a.hour - b.hour || a.minute - b.minute)
      .map((slot) => slotOnJstDay(dayStart, slot))
      .filter((candidate) => candidate >= floor)
      .filter(
        (candidate) =>
          !input.existingSchedules.some(
            (scheduled) => scheduled.getTime() === candidate.getTime(),
          ),
      );
    const candidate = candidates[0];
    if (candidate) return candidate;
  }

  throw new Error(`Could not find a publish slot for ${input.platform}.`);
}

function slotsForEpisode(
  platform: SocialPlatform,
  episodeId: string,
  configured: readonly SocialPublishSlot[],
  config: SocialStrategyConfig,
): SocialPublishSlot[] {
  const cap = normalizeDailyCap(config.dailyPublishCap);
  if (cap > 1 || configured.length <= 1) return [...configured];
  const rate = Math.max(0, Math.min(1, config.slotExplorationRate ?? 0));
  const explore =
    configured.length > 1 &&
    deterministicBucket(`social-slot-v1:${platform}`, episodeId, 10_000) <
      Math.round(rate * 10_000);
  return [explore ? configured[1]! : configured[0]!];
}

function normalizeDailyCap(value: number | undefined): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : 1;
}

function slotOnJstDay(dayStart: Date, slot: SocialPublishSlot): Date {
  return new Date(
    dayStart.getTime() + (slot.hour * 60 + slot.minute) * 60_000,
  );
}

function nextSlotFromChoices(
  platform: SocialPlatform,
  readyAt: Date,
  after: Date | undefined,
  slots: readonly SocialPublishSlot[],
): Date {
  const floor = new Date(Math.max(readyAt.getTime(), after?.getTime() ?? 0));
  const floorDay = startOfJstDay(floor);
  for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
    const dayStart = new Date(
      floorDay.getTime() + dayOffset * 24 * 60 * 60_000,
    );
    for (const slot of slots) {
      const candidate = slotOnJstDay(dayStart, slot);
      if (candidate >= floor) return candidate;
    }
  }
  throw new Error(`Could not find a publish slot for ${platform}.`);
}

function normalizePublishSlots(
  slots: readonly SocialPublishSlot[] | undefined,
  fallback: readonly SocialPublishSlot[] | undefined,
  sort = true,
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
  if (normalized.length === 0) {
    return normalizePublishSlots(fallback, [{ hour: 12, minute: 0 }], sort);
  }
  return sort
    ? normalized.sort((a, b) => a.hour - b.hour || a.minute - b.minute)
    : normalized;
}

export function buildStrategyGuidance(
  platform: SocialPlatform,
  config: SocialStrategyConfig | undefined,
  random: () => number = Math.random,
): string | undefined {
  if (!config) return undefined;
  const exploring = random() < (config.explorationRate ?? 0);
  const lines: string[] = [];
  if (!exploring && config.preferredHookTypes?.length) {
    lines.push(
      `Prefer these historically strong hook types when they genuinely fit the episode: ${config.preferredHookTypes.join(', ')}.`,
    );
  }
  if (
    !exploring &&
    platform === 'rednote' &&
    config.preferredHashtags?.length
  ) {
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
  languageCode: PrimaryLanguageCode;
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
    )
    .filter(isLearnableSample);

  return SOCIAL_PLATFORMS.flatMap((platform) =>
    SUPPORTED_PRIMARY_LANGUAGE_CODES.flatMap((languageCode) => {
      const platformSamples = samples.filter(
        (sample) =>
          sample.post.platform === platform &&
          (sample.post.language_code ?? 'zh-Hant') === languageCode,
      );
      if (platformSamples.length < MIN_PLATFORM_SAMPLES) return [];

      const medianViews = median(
        platformSamples.map((sample) => sample.metric.views ?? 0),
      );
      const scored = platformSamples.map((sample) => ({
        ...sample,
        score: scoreSample(sample.metric, medianViews),
      }));
      const config = defaultSocialStrategy(platform);
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
        config.avoidHashtags = rankedTags
          .slice(-5)
          .filter((row) => row.score < 0.8)
          .map((row) => row.tag);
        const avoided = new Set(config.avoidHashtags);
        config.preferredHashtags = rankedTags
          .filter((row) => !avoided.has(row.tag))
          .slice(0, 8)
          .map((row) => row.tag);
      }

      return [
        {
          platform,
          languageCode,
          config,
          basedOnSamples: platformSamples.length,
        },
      ];
    }),
  );
}

function isLearnableSample(sample: {
  metric: SocialPostMetricRow;
  post: SocialPostRow;
}): boolean {
  if ((sample.metric.collection_status ?? 'collected') === 'unavailable') {
    return false;
  }
  if (sample.post.platform !== 'rednote') return true;
  if (
    sample.post.review_status &&
    SUPPRESSED_REVIEW_STATUSES.includes(sample.post.review_status)
  ) {
    return false;
  }
  return (sample.metric.views ?? 0) > REDNOTE_MIN_LEARNABLE_VIEWS;
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
    const current =
      activeByPlatform[strategyMapKey(learned.platform, learned.languageCode)];
    if (current && sameStrategy(current.config, learned.config)) continue;
    const version = await activateSocialStrategy({
      platform: learned.platform,
      languageCode: learned.languageCode,
      config: learned.config,
      basedOnSamples: learned.basedOnSamples,
      now: input.now,
    });
    log(
      `🧠 [strategy] ${laneLabel(learned.platform, learned.languageCode)} · activated v${version.version} · ${learned.basedOnSamples} × 24h samples`,
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
      ? { publishSlotsJst: [...config.publishSlotsJst] }
      : {}),
    ...(config.dailyPublishCap !== undefined
      ? { dailyPublishCap: config.dailyPublishCap }
      : {}),
    ...(config.slotExplorationRate !== undefined
      ? { slotExplorationRate: config.slotExplorationRate }
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
