import type { SocialPostMetricRow, SocialPostRow } from '../types.js';
import { median } from './statistics.js';

export interface SocialExperimentArmReport {
  variant: string;
  samples: number;
  medianReach: number;
  medianEngagementRate: number;
  medianProfileVisitRate: number;
}

export interface SocialExperimentReport {
  experimentKey: string;
  arms: SocialExperimentArmReport[];
  evaluable: boolean;
  telemetryComplete: boolean;
  durationDays: number;
}

const MIN_SAMPLES_PER_ARM = 20;
const MIN_DURATION_DAYS = 7;

export function buildSocialExperimentReports(input: {
  posts: readonly SocialPostRow[];
  metrics: readonly SocialPostMetricRow[];
}): SocialExperimentReport[] {
  const metricsByPost = new Map(
    input.metrics
      .filter((metric) => metric.measurement_window === '24h')
      .map((metric) => [metric.social_post_id, metric]),
  );
  const byExperiment = new Map<string, SocialPostRow[]>();
  for (const post of input.posts) {
    if (!post.experiment_key || !post.experiment_variant) continue;
    const rows = byExperiment.get(post.experiment_key) ?? [];
    rows.push(post);
    byExperiment.set(post.experiment_key, rows);
  }

  return [...byExperiment.entries()].map(([experimentKey, posts]) => {
    const timestamps = posts.map(({ published_at }) =>
      Date.parse(published_at),
    );
    const durationDays =
      (Math.max(...timestamps) - Math.min(...timestamps)) / (24 * 60 * 60_000);
    const variants = [
      ...new Set(posts.map((post) => post.experiment_variant!)),
    ];
    const arms = variants.map((variant) => {
      const samples = posts
        .filter((post) => post.experiment_variant === variant)
        .flatMap((post) => {
          const metric = metricsByPost.get(post.id);
          return metric ? [{ post, metric }] : [];
        });
      return {
        variant,
        samples: samples.length,
        medianReach: median(samples.map(({ metric }) => metric.views ?? 0)),
        medianEngagementRate: median(
          samples.map(({ metric }) => rate(engagements(metric), metric.views)),
        ),
        medianProfileVisitRate: median(
          samples.map(({ metric }) =>
            rate(metric.profile_visits, metric.views),
          ),
        ),
      };
    });
    const telemetryComplete = posts.every((post) => metricsByPost.has(post.id));
    return {
      experimentKey,
      arms,
      telemetryComplete,
      durationDays,
      evaluable:
        arms.length >= 2 &&
        arms.every(({ samples }) => samples >= MIN_SAMPLES_PER_ARM) &&
        durationDays >= MIN_DURATION_DAYS &&
        telemetryComplete,
    };
  });
}

function engagements(metric: SocialPostMetricRow): number {
  return [metric.likes, metric.comments, metric.shares, metric.saves]
    .filter((value): value is number => value !== null)
    .reduce((sum, value) => sum + value, 0);
}

function rate(numerator: number | null, denominator: number | null): number {
  return numerator !== null && denominator !== null && denominator > 0
    ? numerator / denominator
    : 0;
}
