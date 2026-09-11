/**
 * Read-model helpers shared by more than one page.
 *
 * These live outside the page files because Today and Reliability both need
 * `retryWaste`, and Reliability and Growth both need `sourceStatus` — a copy in
 * each page would be a duplicate long enough to fail `dup:check`.
 */

import type {
  OperationalStatus,
  OperationsResponse,
  OperationsSource,
  PodcastCostResponse,
  SocialGrowthLane,
} from '../shared/types.js';
import type { DashboardView } from './components/AppShell.js';
import { integer } from './format.js';

export interface RetryWaste {
  rate: number | null;
  wasteUsd: number | null;
}

/** Sunk cost from failed attempts, as a share of all podcast spend. An
 * unavailable or empty ledger is `null`, never `0`: nobody has said it is zero. */
export function retryWaste(data: PodcastCostResponse | null): RetryWaste {
  if (!data || data.status !== 'ok' || data.episodes.length === 0) {
    return { rate: null, wasteUsd: null };
  }
  const totals = data.episodes.reduce(
    (sum, episode) => ({
      all: sum.all + episode.totalCostUsd,
      wasted: sum.wasted + episode.retryWasteUsd,
    }),
    { all: 0, wasted: 0 },
  );
  return {
    rate: totals.all > 0 ? totals.wasted / totals.all : 0,
    wasteUsd: totals.wasted,
  };
}

export function languageSignal(lane: SocialGrowthLane): string {
  const parts = [`${integer(lane.postCount7d)} posts`];
  if (lane.medianReach24h !== null) {
    parts.push(`${integer(lane.medianReach24h)} median reach`);
  }
  if (lane.followersPer1kReach !== null) {
    parts.push(`${lane.followersPer1kReach.toFixed(1)} followers / 1k`);
  }
  return parts.join(' · ');
}

/** The worst status any signal from this source is reporting. A source with no
 * signals is `unknown`, not `healthy` — it has not told us it is fine. */
export function sourceStatus(
  data: OperationsResponse | null,
  source: OperationsSource,
): OperationalStatus {
  const states = (data?.signals ?? [])
    .filter((signal) => signal.source === source)
    .map((signal) => signal.status);
  if (states.includes('critical')) {
    return 'critical';
  }
  if (states.includes('degraded')) {
    return 'degraded';
  }
  if (states.includes('unknown') || states.length === 0) {
    return 'unknown';
  }
  return 'healthy';
}

const STATUS_TEXT: Record<OperationalStatus, string> = {
  critical: 'Action required',
  degraded: 'Needs attention',
  healthy: 'Healthy',
  unknown: 'Unknown',
};

export function statusText(status: OperationalStatus | undefined): string {
  return STATUS_TEXT[status ?? 'unknown'];
}

const SOURCE_LABELS = new Map<OperationsSource, string>([
  ['customer-economics', 'Customer data'],
  ['product-health', 'Product data'],
  ['cost-ledger', 'Cost ledger'],
  ['social-queue', 'Social queue'],
  ['social-daemon', 'Social daemon'],
  ['github-actions', 'GitHub Actions'],
  ['fly', 'Fly.io'],
  ['sentry', 'Sentry'],
  ['posthog', 'PostHog'],
]);

export function sourceLabel(source: OperationsSource): string {
  return SOURCE_LABELS.get(source) ?? source;
}

export function destinationFor(
  source: OperationsSource,
  domain: OperationsResponse['signals'][number]['domain'],
): DashboardView {
  if (source === 'social-queue' || source === 'social-daemon') {
    return 'pipeline';
  }
  if (domain === 'analytics') {
    return 'growth';
  }
  return 'reliability';
}
