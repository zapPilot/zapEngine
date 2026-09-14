/**
 * Read-model helpers shared by more than one page.
 *
 * These live outside the page files because Today and Reliability both need
 * `failedAttemptShareStat` — a copy in each page would be a duplicate long
 * enough to fail `dup:check`.
 */

import {
  type EvidenceAmount,
  podcastCostEvidenceTotals,
} from '../shared/podcast-cost-evidence.js';
import type {
  OperationalStatus,
  OperationsResponse,
  OperationsSource,
  PodcastCostResponse,
} from '../shared/types.js';
import type { DashboardView } from './components/AppShell.js';
import { percent, usd } from './format.js';
import type { Tone } from './components/ui/tone.js';

/** Above this, failed attempts stop reading as ordinary pipeline noise. */
export const FAILED_ATTEMPT_SHARE_DANGER = 0.15;

export interface FailedAttemptCost {
  /** Failed-attempt spend over all episode spend. Null when nothing was spent. */
  share: number | null;
  /** Null when the ledger said nothing, never `0`: nobody claimed it is zero. */
  costUsd: number | null;
}

export function failedAttemptCost(
  data: PodcastCostResponse | null,
): FailedAttemptCost {
  if (!data || data.status !== 'ok' || data.episodes.length === 0) {
    return { share: null, costUsd: null };
  }
  const totals = podcastCostEvidenceTotals(data.episodes);
  return {
    share: totals.failedAttemptShare,
    costUsd: totals.failedAttemptCostUsd,
  };
}

/** The one-number version Today and Reliability both show. */
export function failedAttemptShareStat(data: PodcastCostResponse | null): {
  caption: string;
  tone: Tone;
  value: string;
} {
  const failed = failedAttemptCost(data);
  return {
    caption:
      failed.costUsd === null
        ? (data?.message ?? 'No priced attempts yet')
        : `${usd(failed.costUsd)} spent on attempts whose run failed`,
    tone:
      failed.share !== null && failed.share > FAILED_ATTEMPT_SHARE_DANGER
        ? 'danger'
        : 'neutral',
    value: percent(failed.share),
  };
}

/**
 * Evidence that is absent reads as `Unknown`, and evidence that is partial
 * reads as a floor. Printing `$0.00` for either would turn "the ledger cannot
 * say" into "nothing was wasted".
 */
export function evidenceAmountText(amount: EvidenceAmount): string {
  if (amount.usd === null) {
    return 'Unknown';
  }
  return amount.lowerBound ? `≥ ${usd(amount.usd)}` : usd(amount.usd);
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
