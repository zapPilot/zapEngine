import {
  createFixedMonthlyCostSnapshot,
  fetchDeBankCostSnapshot,
  fetchOpenRouterCostSnapshot,
  resolvePricingRate,
  type CostPricingRate,
  type CostProvider,
  type CostSnapshot,
  type CostType,
  type FetchLike,
} from '@zapengine/cost-observability';

import type { CostProviderResult } from '../../shared/types.js';
import type { ControlCenterConfig } from '../config/env.js';
import { fetchFlyRunRateSnapshot } from './fly.js';

interface CostSource {
  provider: CostProvider;
  label: string;
  costType: CostType;
  configured: boolean;
  pricingRateId: string | null;
  load: () => Promise<CostSnapshot>;
}

export interface CollectedCostProvider extends CostProviderResult {
  pricingRateId: string | null;
}

export async function collectCostProviders(input: {
  config: ControlCenterConfig;
  pricingRates: CostPricingRate[];
  fetch?: FetchLike;
  now?: Date;
}): Promise<CollectedCostProvider[]> {
  const now = input.now ?? new Date();
  const openRouterKey =
    input.config.OPENROUTER_MANAGEMENT_KEY ?? input.config.OPENROUTER_API_KEY;
  const debankRate = resolvePricingRate(input.pricingRates, {
    provider: 'debank',
    metricKey: 'api_unit',
    at: now,
  });
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
          load: () => fetchFlyRunRateSnapshot({ now }),
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
      message:
        source.provider === 'debank' && source.pricingRateId === null
          ? 'Usage available; pricing rate missing'
          : 'Not connected',
    };
  }

  try {
    const snapshot = await source.load();
    return {
      provider: source.provider,
      label: source.label,
      status: 'ok',
      costType: snapshot.costType,
      snapshot,
      pricingRateId: source.pricingRateId,
      message:
        source.provider === 'debank' && snapshot.accruedCostUsd === null
          ? 'Usage synced; USD cost unknown'
          : null,
    };
  } catch (error) {
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
    load: () => Promise.reject(new Error('Not connected')),
  };
}

function safeProviderError(error: unknown): string {
  if (error instanceof Error && /\(\d{3}\)$/.test(error.message)) {
    return error.message;
  }
  return 'Provider request failed';
}
