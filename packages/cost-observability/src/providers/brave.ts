import { currentUtcPeriod, projectMonthEnd } from '../time.js';
import type { CostSnapshot, FetchLike } from '../types.js';
import { normalizeNonNegative, roundUsageUsd } from './numbers.js';

const BRAVE_IMAGES_SEARCH_ENDPOINT =
  'https://api.search.brave.com/res/v1/images/search';
const DEFAULT_MONTHLY_FREE_CREDIT_USD = 5;
const MINIMUM_LONG_QUOTA_WINDOW_SECONDS = 86_400;

export interface BraveCostInput {
  apiKey: string;
  unitCostUsd?: number;
  fetch?: FetchLike;
  now?: Date;
  baseUrl?: string;
  priorMonthTotalUsd?: number | null;
  monthlyFreeCreditUsd?: number;
}

interface BraveMonthlyQuota {
  limit: number;
  remaining: number;
  resetSeconds: number | null;
  used: number;
}

/**
 * Brave does not expose a separate account usage endpoint for Search. Every
 * successful Search response does expose the plan's rate-limit windows, so one
 * tiny image-search request can read the account-wide monthly quota without
 * instrumenting every consumer of the same API key.
 *
 * The returned cost is deliberately list-price-equivalent. Brave's monthly
 * promotional credit is an account/billing adjustment, not a lower Search unit
 * price, so the gross operating cost stays comparable month-to-month while the
 * estimated post-credit bill remains visible in `usage`.
 */
export async function fetchBraveCostSnapshot(
  input: BraveCostInput,
): Promise<CostSnapshot> {
  const now = input.now ?? new Date();
  const fetcher = input.fetch ?? globalThis.fetch;
  const endpoint = new URL(input.baseUrl ?? BRAVE_IMAGES_SEARCH_ENDPOINT);
  endpoint.searchParams.set('q', 'Brave Search quota probe');
  endpoint.searchParams.set('count', '1');
  endpoint.searchParams.set('safesearch', 'strict');
  endpoint.searchParams.set('search_lang', 'en');

  const response = await fetcher(endpoint, {
    headers: {
      accept: 'application/json',
      'x-subscription-token': input.apiKey,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Brave Search quota request failed (${response.status})`);
  }

  const quota = readMonthlyQuota(response.headers);
  const unitCostUsd = normalizeNonNegative(input.unitCostUsd);
  const grossCostUsd =
    unitCostUsd === null ? null : roundUsageUsd(quota.used * unitCostUsd);
  const monthlyFreeCreditUsd =
    normalizeNonNegative(input.monthlyFreeCreditUsd) ??
    DEFAULT_MONTHLY_FREE_CREDIT_USD;
  const estimatedBilledUsd =
    grossCostUsd === null
      ? null
      : roundUsageUsd(Math.max(0, grossCostUsd - monthlyFreeCreditUsd));

  return {
    provider: 'brave',
    ...currentUtcPeriod(now),
    usage: [
      {
        key: 'monthly_requests',
        label: 'Search requests used',
        unit: 'units',
        value: quota.used,
      },
      {
        key: 'remaining_requests',
        label: 'Search requests remaining',
        unit: 'units',
        value: quota.remaining,
      },
      {
        key: 'monthly_request_limit',
        label: 'Monthly request limit',
        unit: 'units',
        value: quota.limit,
      },
      ...(quota.resetSeconds === null
        ? []
        : [
            {
              key: 'quota_reset_seconds',
              label: 'Quota reset (seconds)',
              unit: 'units' as const,
              value: quota.resetSeconds,
            },
          ]),
      ...(grossCostUsd === null
        ? []
        : [
            {
              key: 'gross_search_cost_usd',
              label: 'Gross Search cost',
              unit: 'usd' as const,
              value: grossCostUsd,
            },
            {
              key: 'monthly_free_credit_usd',
              label: 'Monthly free credit',
              unit: 'usd' as const,
              value: monthlyFreeCreditUsd,
            },
            {
              key: 'estimated_billed_usd',
              label: 'Estimated billed after credit',
              unit: 'usd' as const,
              value: estimatedBilledUsd!,
            },
          ]),
    ],
    accruedCostUsd: grossCostUsd,
    projectedCostUsd:
      grossCostUsd === null
        ? null
        : projectMonthEnd(grossCostUsd, now, input.priorMonthTotalUsd),
    costType: 'list-price-equivalent',
    source: 'api',
    fetchedAt: now.toISOString(),
  };
}

function readMonthlyQuota(headers: Headers): BraveMonthlyQuota {
  const limits = parseNumbers(headers.get('x-ratelimit-limit'));
  const remaining = parseNumbers(headers.get('x-ratelimit-remaining'));
  const resets = parseNumbers(headers.get('x-ratelimit-reset'));
  const policies = (headers.get('x-ratelimit-policy') ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (limits.length === 0 || remaining.length === 0) {
    throw new Error('Brave Search quota headers missing');
  }

  const windows = policies.map((policy) => {
    const match = /(?:^|;)w=(\d+)(?:;|$)/.exec(policy);
    return match ? Number(match[1]) : null;
  });
  const index = windows.reduce<number>(
    (best, window, current) =>
      window !== null && (best === -1 || window > (windows[best] ?? -1))
        ? current
        : best,
    -1,
  );
  if (
    index === -1 ||
    (windows[index] ?? 0) < MINIMUM_LONG_QUOTA_WINDOW_SECONDS
  ) {
    throw new Error('Brave Search long-term quota window is not measurable');
  }

  const limit = limits[index];
  const left = remaining[index];
  if (
    limit === undefined ||
    left === undefined ||
    !Number.isFinite(limit) ||
    !Number.isFinite(left) ||
    limit <= 0 ||
    left < 0
  ) {
    throw new Error('Brave Search monthly quota is not measurable');
  }

  return {
    limit,
    remaining: left,
    resetSeconds: resets[index] ?? null,
    used: Math.max(0, limit - left),
  };
}

function parseNumbers(value: string | null): number[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(Number)
    .filter((value) => Number.isFinite(value));
}
