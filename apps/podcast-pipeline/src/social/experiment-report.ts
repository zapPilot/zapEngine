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
  const byExperiment = new Map<
    string,
    { post: SocialPostRow; variant: string }[]
  >();
  for (const post of input.posts) {
    const memberships = [
      post.experiment_key && post.experiment_variant
        ? { key: post.experiment_key, variant: post.experiment_variant }
        : null,
      packagingMembership(post.content_features),
    ].filter(
      (membership): membership is { key: string; variant: string } =>
        membership !== null,
    );
    for (const membership of memberships) {
      const rows = byExperiment.get(membership.key) ?? [];
      rows.push({ post, variant: membership.variant });
      byExperiment.set(membership.key, rows);
    }
  }

  return [...byExperiment.entries()].map(([experimentKey, memberships]) => {
    const timestamps = memberships.map(({ post }) =>
      Date.parse(post.published_at),
    );
    const durationDays =
      (Math.max(...timestamps) - Math.min(...timestamps)) / (24 * 60 * 60_000);
    const variants = [...new Set(memberships.map(({ variant }) => variant))];
    const arms = variants.map((variant) => {
      const samples = memberships
        .filter((membership) => membership.variant === variant)
        .flatMap(({ post }) => {
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
    const telemetryComplete = memberships.every(({ post }) =>
      metricsByPost.has(post.id),
    );
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

function packagingMembership(
  features: SocialPostRow['content_features'],
): { key: string; variant: string } | null {
  if (!features || typeof features !== 'object') return null;
  const value = (features as unknown as Record<string, unknown>)[
    'packagingExperiment'
  ];
  if (!value || typeof value !== 'object') return null;
  const key = (value as Record<string, unknown>)['key'];
  const variant = (value as Record<string, unknown>)['variant'];
  return typeof key === 'string' &&
    key &&
    typeof variant === 'string' &&
    variant
    ? { key, variant }
    : null;
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
