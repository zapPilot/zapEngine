import {
  unavailableContentPackaging,
  type ContentPackagingInsight,
  type PackagingCover,
  type PackagingEpisode,
  type PackagingFeature,
} from '../../../shared/content-packaging.js';
import type { ContentPackagingEvidence } from './content-packaging-source.js';

// Matches pipeline SOCIAL_LANGUAGE_BY_PLATFORM, not a language preference.
const PRIMARY_PLATFORM = 'rednote';
const PRIMARY_LANGUAGE = 'zh-Hant';
const DISTRIBUTION_GATE = 20;
const BASELINE_RADIUS_MS = 7 * 86_400_000;
const MIN_BASELINE_SAMPLES = 5;
const MIN_RANKED_EPISODES = 6;
const MIN_FEATURE_GROUP = 5;
const RANKING_SIZE = 3;
const SUPPRESSED = new Set(['under_review', 'rejected', 'self_only']);
type Post = ContentPackagingEvidence['posts'][number];
type Metric = ContentPackagingEvidence['metrics'][number] & { views: number };
type Sample = { post: Post; metric: Metric };
type Normalized = Sample & { reachLift: number };
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
function pooled(samples: Sample[]): number | null {
  const views = samples.reduce((sum, sample) => sum + sample.metric.views, 0);
  if (!views) {
    return null;
  }
  return (
    samples.reduce(
      (sum, { metric }) =>
        sum +
        (metric.likes ?? 0) +
        (metric.comments ?? 0) +
        (metric.shares ?? 0) +
        (metric.saves ?? 0),
      0,
    ) / views
  );
}
function laneKey(post: Post): string {
  return JSON.stringify([post.platform, post.language_code]);
}
function primary(post: Post): boolean {
  return (
    post.platform === PRIMARY_PLATFORM &&
    post.language_code === PRIMARY_LANGUAGE
  );
}
function coverFor(
  post: Post,
  evidence: ContentPackagingEvidence,
): PackagingCover {
  const localization = evidence.localizations.find(
    (row) => row.episode_id === post.episode_id,
  );
  const video = evidence.videos.find(
    (row) =>
      row.episode_id === post.episode_id &&
      row.episode_localization_id === localization?.id,
  );
  if (
    !video ||
    video.status !== 'completed' ||
    !video.completed_at ||
    Date.parse(video.completed_at) > Date.parse(post.published_at)
  ) {
    return { evidence: 'unverified' };
  }
  return {
    evidence: 'shipped',
    thumbnailUrl: video.thumbnail_url,
    sha256: video.coverPhoto?.sha256 ?? null,
    status: video.coverPhoto?.status ?? null,
    sourceImageUrl: video.coverPhoto?.sourceImageUrl ?? null,
    fallbackReason: video.coverPhoto?.fallbackReason ?? null,
  };
}
/** Observed associations only. Never use these ranks to choose articles or topics. */
export function buildContentPackagingInsight(
  evidence: ContentPackagingEvidence,
): ContentPackagingInsight {
  const result = unavailableContentPackaging(
    'At least six episodes with rolling baselines are required',
  );
  result.status = 'insufficient';
  const metricByPost = new Map(
    evidence.metrics.map((row) => [row.social_post_id, row]),
  );
  const learnable: Sample[] = [];
  const distributed: Sample[] = [];
  for (const post of evidence.posts) {
    const metric = metricByPost.get(post.id);
    if (
      !metric ||
      metric.collection_status === 'unavailable' ||
      metric.views === null
    ) {
      continue;
    }
    const sample = { post, metric: { ...metric, views: metric.views } };
    if (primary(post)) {
      result.primaryLane.samples++;
    }
    if (
      post.platform === PRIMARY_PLATFORM &&
      post.review_status &&
      SUPPRESSED.has(post.review_status)
    ) {
      if (primary(post)) {
        result.primaryLane.suppressed++;
      }
      continue;
    }
    if (
      post.platform === PRIMARY_PLATFORM &&
      metric.views <= DISTRIBUTION_GATE
    ) {
      if (primary(post)) {
        result.primaryLane.undistributed++;
      }
      continue;
    }
    learnable.push(sample);
    if (primary(post)) {
      distributed.push(sample);
    }
  }
  const summary = result.primaryLane;
  summary.distributed = distributed.length;
  const eligible = summary.distributed + summary.undistributed;
  summary.undistributedRatio = eligible
    ? summary.undistributed / eligible
    : null;
  summary.medianViews = distributed.length
    ? median(distributed.map((s) => s.metric.views))
    : null;
  summary.maxViews = distributed.length
    ? Math.max(...distributed.map((s) => s.metric.views))
    : null;
  summary.engagementRate = pooled(distributed);
  const lanes = new Map<string, Sample[]>();
  for (const sample of learnable) {
    const key = laneKey(sample.post);
    const values = lanes.get(key) ?? [];
    values.push(sample);
    lanes.set(key, values);
  }
  result.confirmationLanes = [...lanes.values()]
    .filter((samples) => !primary(samples[0]!.post))
    .map((samples) => ({
      platform: samples[0]!.post.platform,
      languageCode: samples[0]!.post.language_code,
      samples: samples.length,
    }));
  const normalized: Normalized[] = [];
  for (const sample of learnable) {
    const neighbors = lanes
      .get(laneKey(sample.post))!
      .filter(
        (other) =>
          other.post.id !== sample.post.id &&
          Math.abs(
            Date.parse(other.post.published_at) -
              Date.parse(sample.post.published_at),
          ) <= BASELINE_RADIUS_MS,
      );
    const baseline =
      neighbors.length >= MIN_BASELINE_SAMPLES
        ? median(neighbors.map((s) => s.metric.views))
        : 0;
    if (baseline <= 0) {
      if (primary(sample.post)) {
        summary.insufficientBaseline++;
      }
      continue;
    }
    normalized.push({ ...sample, reachLift: sample.metric.views / baseline });
  }
  const byEpisode = new Map<string, Normalized>();
  for (const sample of normalized.filter((s) => primary(s.post))) {
    byEpisode.set(sample.post.episode_id, sample);
  }
  const ranked = [...byEpisode.values()]
    .map(
      (sample): PackagingEpisode => ({
        episodeId: sample.post.episode_id,
        publishedAt: sample.post.published_at,
        shownTitle: sample.post.published_title,
        canonicalTitle:
          evidence.localizations.find(
            (row) => row.episode_id === sample.post.episode_id,
          )?.title ?? null,
        views: sample.metric.views,
        reachLift: sample.reachLift,
        engagementRate: pooled([sample]),
        confirmations: normalized
          .filter(
            (other) =>
              other.post.episode_id === sample.post.episode_id &&
              !primary(other.post),
          )
          .map((other) => ({
            platform: other.post.platform,
            languageCode: other.post.language_code,
            reachLift: other.reachLift,
          })),
        cover: coverFor(sample.post, evidence),
      }),
    )
    .sort(
      (a, b) =>
        b.reachLift - a.reachLift ||
        /* v8 ignore next -- ranked samples always cleared DISTRIBUTION_GATE
           (> 20 views), so pooled() cannot return null here; the fallback only
           guards the nullable type. */
        (b.engagementRate ?? 0) - (a.engagementRate ?? 0) ||
        Date.parse(b.publishedAt) - Date.parse(a.publishedAt) ||
        a.episodeId.localeCompare(b.episodeId),
    );
  result.rankedEpisodes = ranked.length;
  if (ranked.length < MIN_RANKED_EPISODES) {
    return result;
  }
  result.status = 'available';
  result.message = null;
  result.top = ranked.slice(0, RANKING_SIZE);
  result.bottom = ranked.slice(-RANKING_SIZE).reverse();
  // Unknown shown titles must not become the "without" group.
  const titled = [...byEpisode.values()].filter(
    (s) => s.post.published_title !== null,
  );
  if (!titled.length) {
    return result;
  }
  const threshold = median(
    titled.map((s) => Array.from(s.post.published_title!).length),
  );
  const definitions: Array<{
    key: PackagingFeature['key'];
    threshold: number | null;
    matches: (title: string) => boolean;
  }> = [
    {
      key: 'title_has_number',
      threshold: null,
      matches: (title) => /[0-9０-９]/.test(title),
    },
    {
      key: 'title_has_question',
      threshold: null,
      matches: (title) => /[?？]/.test(title),
    },
    {
      key: 'title_longer_than_median',
      threshold,
      matches: (title) => Array.from(title).length > threshold,
    },
  ];
  result.features = definitions.flatMap((feature) => {
    const withFeature = titled.filter((s) =>
      feature.matches(s.post.published_title!),
    );
    const without = titled.filter(
      (s) => !feature.matches(s.post.published_title!),
    );
    if (
      withFeature.length < MIN_FEATURE_GROUP ||
      without.length < MIN_FEATURE_GROUP
    ) {
      return [];
    }
    const withMedian = median(withFeature.map((s) => s.reachLift));
    const withoutMedian = median(without.map((s) => s.reachLift));
    return [
      {
        key: feature.key,
        threshold: feature.threshold,
        lift: withMedian / withoutMedian,
        with: {
          n: withFeature.length,
          medianReachLift: withMedian,
          engagementRate: pooled(withFeature),
        },
        without: {
          n: without.length,
          medianReachLift: withoutMedian,
          engagementRate: pooled(without),
        },
      },
    ];
  });
  return result;
}
