import {
  createFixedMonthlyCostSnapshot,
  fetchBraveCostSnapshot,
  fetchCloudflareCostSnapshot,
  fetchDeBankCostSnapshot,
  fetchOpenRouterCostSnapshot,
  resolvePricingRate,
  UsageNotMeasurableError,
  type CostPricingRate,
  type CostProvider,
  type CostSnapshot,
  type CostType,
  type FetchLike,
} from '@zapengine/cost-observability';

import type {
  CostProviderResult,
  ProviderMonthCost,
} from '../../shared/types.js';
import type { ControlCenterConfig } from '../config/env.js';
import { CLOUDFLARE_UNPRICED_MESSAGE } from './cost-history-aggregate.js';
import { fetchFlyRunRateSnapshot, type FlyctlRunner } from './fly.js';

interface CostSource {
  provider: CostProvider;
  label: string;
  costType: CostType;
  configured: boolean;
  pricingRateId: string | null;
  // Present only when `configured`: `loadSource` returns early otherwise, so
  // an unconfigured source never needs a loader. Keeping it optional removes
  // the dead `Promise.reject` stub that existed only to satisfy the type.
  load?: () => Promise<CostSnapshot>;
}

export interface CollectedCostProvider extends CostProviderResult {
  pricingRateId: string | null;
}

/**
 * `priorMonthTotals` is what the metered providers need to survive the first
 * days of a month: extrapolating a few hours of spend across thirty days turns
 * pocket change into a scary headline, so the loaders anchor the unelapsed part
 * of the month to what the provider actually cost last month. Cloudflare
 * anchors on it too: its billing data lags, so an early-month read is a real
 * figure that is simply incomplete. Only these providers get it — Supabase is a
 * flat commitment with nothing to project, and Fly's collector reports no cost
 * at all.
 */
export async function collectCostProviders(input: {
  config: ControlCenterConfig;
  pricingRates: CostPricingRate[];
  fetch?: FetchLike;
  now?: Date;
  priorMonthTotals?: ProviderMonthCost[] | null;
  flyRun?: FlyctlRunner;
}): Promise<CollectedCostProvider[]> {
  const now = input.now ?? new Date();
  const priorMonthTotal = priorMonthLookup(input.priorMonthTotals);
  const openRouterKey =
    input.config.OPENROUTER_MANAGEMENT_KEY ?? input.config.OPENROUTER_API_KEY;
  const debankRate = resolvePricingRate(input.pricingRates, {
    provider: 'debank',
    metricKey: 'api_unit',
    at: now,
  });
  const braveRate = resolvePricingRate(input.pricingRates, {
    provider: 'brave',
    metricKey: 'search_request',
    at: now,
  });
  // Cloudflare needs both halves. Holding only one reports "not connected"
  // rather than sending a request that is certain to be rejected.
  const cloudflareConfigured = Boolean(
    input.config.CLOUDFLARE_API_TOKEN && input.config.CLOUDFLARE_ACCOUNT_ID,
  );
  const supabaseRate = resolvePricingRate(input.pricingRates, {
    provider: 'supabase',
    metricKey: 'pro_plan',
    at: now,
  });

  const sources: CostSource[] = [
    {
      provider: 'openrouter',
      label: 'OpenRouter',
      costType: 'actual',
      configured: Boolean(openRouterKey),
      pricingRateId: null,
      load: () =>
        fetchOpenRouterCostSnapshot({
          apiKey: openRouterKey!,
          fetch: input.fetch,
          now,
          baseUrl: input.config.OPENROUTER_BASE_URL,
          priorMonthTotalUsd: priorMonthTotal('openrouter'),
        }),
    },
    {
      provider: 'debank',
      label: 'DeBank',
      costType: 'list-price-equivalent',
      configured: Boolean(input.config.DEBANK_API_KEY),
      pricingRateId: debankRate?.id ?? null,
      load: () =>
        fetchDeBankCostSnapshot({
          apiKey: input.config.DEBANK_API_KEY!,
          unitCostUsd: debankRate?.priceUsd,
          fetch: input.fetch,
          now,
          baseUrl: input.config.DEBANK_BASE_URL,
          priorMonthTotalUsd: priorMonthTotal('debank'),
        }),
    },
    {
      provider: 'brave',
      label: 'Brave Search',
      costType: 'list-price-equivalent',
      configured: Boolean(input.config.BRAVE_SEARCH_API_KEY),
      pricingRateId: braveRate?.id ?? null,
      load: () =>
        fetchBraveCostSnapshot({
          apiKey: input.config.BRAVE_SEARCH_API_KEY!,
          unitCostUsd: braveRate?.priceUsd,
          fetch: input.fetch,
          now,
          priorMonthTotalUsd: priorMonthTotal('brave'),
        }),
    },
    {
      provider: 'cloudflare',
      label: 'Cloudflare',
      costType: 'actual',
      configured: cloudflareConfigured,
      pricingRateId: null,
      load: () =>
        fetchCloudflareCostSnapshot({
          apiToken: input.config.CLOUDFLARE_API_TOKEN!,
          accountId: input.config.CLOUDFLARE_ACCOUNT_ID!,
          fetch: input.fetch,
          now,
          priorMonthTotalUsd: priorMonthTotal('cloudflare'),
        }),
    },
    {
      provider: 'supabase',
      label: 'Supabase',
      costType: 'fixed',
      configured: Boolean(supabaseRate),
      pricingRateId: supabaseRate?.id ?? null,
      load: async () =>
        createFixedMonthlyCostSnapshot({
          provider: 'supabase',
          monthlyCostUsd: supabaseRate!.priceUsd,
          usageLabel: 'Pro monthly plan',
          now,
        }),
    },
    input.config.FLY_COST_MODE === 'flyctl'
      ? {
          provider: 'fly',
          label: 'Fly.io',
          costType: 'estimated',
          configured: true,
          pricingRateId: null,
          load: () => fetchFlyRunRateSnapshot({ now, run: input.flyRun }),
        }
      : staticUnconfiguredSource('fly', 'Fly.io', 'estimated'),
  ];

  return Promise.all(sources.map(loadSource));
}

async function loadSource(source: CostSource): Promise<CollectedCostProvider> {
  if (!source.configured) {
    return {
      provider: source.provider,
      label: source.label,
      status: 'unconfigured',
      costType: source.costType,
      snapshot: null,
      pricingRateId: source.pricingRateId,
      message: meteredRateMissing(source)
        ? 'Usage available; pricing rate missing'
        : 'Not connected',
    };
  }

  try {
    // `configured` implies `load` is present: unconfigured sources return
    // early above and never provide a loader.
    const snapshot = await source.load!();
    return {
      provider: source.provider,
      label: source.label,
      status: 'ok',
      costType: snapshot.costType,
      snapshot,
      pricingRateId: source.pricingRateId,
      message: unpricedMessage(source, snapshot),
    };
  } catch (error) {
    // A provider that answered but can no longer be measured is not an
    // outage, and `sync.ts` exits non-zero on any `error`. Filing it as one
    // turns the nightly job permanently red over a vendor decision, which
    // costs us the only signal that would show a genuinely broken collector.
    // `unconfigured` is this vocabulary's "collected nothing, nothing to fix
    // in here", which is exactly the situation. The message is authored by the
    // collector rather than echoed from the vendor, so it needs no sanitising.
    if (error instanceof UsageNotMeasurableError) {
      return {
        provider: source.provider,
        label: source.label,
        status: 'unconfigured',
        costType: source.costType,
        snapshot: null,
        pricingRateId: source.pricingRateId,
        message: error.message,
      };
    }
    return {
      provider: source.provider,
      label: source.label,
      status: 'error',
      costType: source.costType,
      snapshot: null,
      pricingRateId: source.pricingRateId,
      message: safeProviderError(error),
    };
  }
}

/**
 * Why a successfully collected snapshot still carries no dollar figure. A
 * metered provider is missing our own rate card; Cloudflare answered with
 * charge rows that carry no cost field at all, which is not something a rate
 * card here would fix — so the two do not share a sentence.
 */
function unpricedMessage(
  source: CostSource,
  snapshot: CostSnapshot,
): string | null {
  if (snapshot.accruedCostUsd !== null) {
    return null;
  }
  if (meteredRateMissing(source)) {
    return 'Usage synced; USD cost unknown';
  }
  return source.provider === 'cloudflare' ? CLOUDFLARE_UNPRICED_MESSAGE : null;
}

function meteredRateMissing(source: CostSource): boolean {
  return (
    (source.provider === 'debank' || source.provider === 'brave') &&
    source.pricingRateId === null
  );
}

/**
 * A missing provider and a provider whose prior month is unknown are the same
 * answer — `null`, never `0`. Zero would tell a loader that last month really
 * cost nothing and drag its projection to the floor.
 */
function priorMonthLookup(
  totals: ProviderMonthCost[] | null | undefined,
): (provider: CostProvider) => number | null {
  const byProvider = new Map<CostProvider, number | null>(
    (totals ?? []).map((entry) => [entry.provider, entry.accruedCostUsd]),
  );
  return (provider) => byProvider.get(provider) ?? null;
}

function staticUnconfiguredSource(
  provider: CostProvider,
  label: string,
  costType: CostType,
): CostSource {
  return {
    provider,
    label,
    costType,
    configured: false,
    pricingRateId: null,
  };
}

function safeProviderError(error: unknown): string {
  if (error instanceof Error) {
    if (/^(?:Brave Search|Cloudflare) /u.test(error.message)) {
      return error.message;
    }
    if (/\(\d{3}\)$/.test(error.message)) {
      return error.message;
    }
  }
  return 'Provider request failed';
}
