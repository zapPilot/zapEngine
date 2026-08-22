import {
  fetchDeBankCostSnapshot,
  fetchOpenRouterCostSnapshot,
  type CostProvider,
  type CostSnapshot,
  type CostType,
  type FetchLike,
} from '@zapengine/cost-observability';

import type { CostProviderResult } from '../../shared/types.js';
import type { ControlCenterConfig } from '../config/env.js';

interface CostSource {
  provider: CostProvider;
  label: string;
  costType: CostType;
  configured: boolean;
  load: () => Promise<CostSnapshot>;
}

export async function loadCostProviders(input: {
  config: ControlCenterConfig;
  fetch?: FetchLike;
  now?: Date;
}): Promise<CostProviderResult[]> {
  const now = input.now ?? new Date();
  const openRouterKey =
    input.config.OPENROUTER_MANAGEMENT_KEY ?? input.config.OPENROUTER_API_KEY;
  const sources: CostSource[] = [
    {
      provider: 'openrouter',
      label: 'OpenRouter',
      costType: 'actual',
      configured: Boolean(openRouterKey),
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
      load: () =>
        fetchDeBankCostSnapshot({
          apiKey: input.config.DEBANK_API_KEY!,
          unitCostUsd: input.config.DEBANK_UNIT_COST_USD,
          fetch: input.fetch,
          now,
          baseUrl: input.config.DEBANK_BASE_URL,
        }),
    },
    staticUnconfiguredSource('supabase', 'Supabase', 'estimated'),
    staticUnconfiguredSource('fly', 'Fly.io', 'estimated'),
  ];

  return Promise.all(sources.map(loadSource));
}

async function loadSource(source: CostSource): Promise<CostProviderResult> {
  if (!source.configured) {
    return {
      provider: source.provider,
      label: source.label,
      status: 'unconfigured',
      costType: source.costType,
      snapshot: null,
      message: 'Not connected',
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
      message: null,
    };
  } catch (error) {
    return {
      provider: source.provider,
      label: source.label,
      status: 'error',
      costType: source.costType,
      snapshot: null,
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
    load: () => Promise.reject(new Error('Not connected')),
  };
}

function safeProviderError(error: unknown): string {
  if (error instanceof Error && /\(\d{3}\)$/.test(error.message)) {
    return error.message;
  }
  return 'Provider request failed';
}
