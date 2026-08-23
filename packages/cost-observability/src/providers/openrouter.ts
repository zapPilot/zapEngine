import { z } from 'zod';

import { type CostSnapshot, type FetchLike } from '../types.js';
import { currentUtcPeriod, projectMonthEnd } from '../time.js';

const responseSchema = z.object({
  data: z.object({
    usage: z.number().nonnegative(),
    usage_daily: z.number().nonnegative(),
    usage_weekly: z.number().nonnegative(),
    usage_monthly: z.number().nonnegative(),
    limit: z.number().nonnegative().nullable(),
    limit_remaining: z.number().nonnegative().nullable(),
  }),
});

export interface OpenRouterCostInput {
  apiKey: string;
  fetch?: FetchLike;
  now?: Date;
  baseUrl?: string;
}

export async function fetchOpenRouterCostSnapshot(
  input: OpenRouterCostInput,
): Promise<CostSnapshot> {
  const now = input.now ?? new Date();
  const fetcher = input.fetch ?? globalThis.fetch;
  const baseUrl = input.baseUrl ?? 'https://openrouter.ai/api/v1';
  const response = await fetcher(`${baseUrl}/key`, {
    headers: { Authorization: `Bearer ${input.apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`OpenRouter usage request failed (${response.status})`);
  }

  const { data } = responseSchema.parse(await response.json());
  return {
    provider: 'openrouter',
    ...currentUtcPeriod(now),
    usage: [
      { key: 'daily', label: 'Today', unit: 'usd', value: data.usage_daily },
      {
        key: 'weekly',
        label: 'This week',
        unit: 'usd',
        value: data.usage_weekly,
      },
      {
        key: 'monthly',
        label: 'This month',
        unit: 'usd',
        value: data.usage_monthly,
      },
      ...(data.limit_remaining === null
        ? []
        : [
            {
              key: 'limit_remaining',
              label: 'Remaining limit',
              unit: 'usd' as const,
              value: data.limit_remaining,
            },
          ]),
    ],
    accruedCostUsd: data.usage_monthly,
    projectedCostUsd: projectMonthEnd(data.usage_monthly, now),
    costType: 'actual',
    source: 'api',
    fetchedAt: now.toISOString(),
  };
}
