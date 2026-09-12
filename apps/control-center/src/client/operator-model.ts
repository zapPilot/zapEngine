/**
 * Read-model helpers shared by more than one page.
 *
 * These live outside the page files because Today and Reliability both need
 * `retryWaste` — a copy in each page would be a duplicate long enough to fail
 * `dup:check`.
 */

import type {
  OperationalStatus,
  OperationsResponse,
  OperationsSource,
  PodcastCostResponse,
} from '../shared/types.js';
import type { DashboardView } from './components/AppShell.js';

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
