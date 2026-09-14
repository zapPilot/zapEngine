import { expect, vi, type Mock } from 'vitest';

import type { CostSnapshot } from '../types.js';
import { fetchBraveCostSnapshot } from './brave.js';

/**
 * Shared fixtures for the provider collector tests. The OpenRouter key
 * payload, the Brave quota stub response, and the default-collector
 * assertions are identical across `providers.test.ts` and
 * `coverage-completion.test.ts`; they live here so the duplication gate
 * sees one definition instead of copy-pasted setup blocks.
 */
export function braveTestResponse(
  headers: Record<string, string>,
  status = 200,
): Response {
  return new Response('{}', { status, headers });
}

export function createOpenRouterKeyFetcher(args: {
  usage: number;
  limit?: number | null;
  limitRemaining?: number | null;
}): Mock {
  const { usage, limit = 100, limitRemaining = null } = args;
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        data: {
          usage,
          usage_daily: usage,
          usage_weekly: usage,
          usage_monthly: usage,
          limit,
          limit_remaining: limitRemaining,
        },
      }),
    ),
  );
}

export function expectFreshZeroCostSnapshot(snapshot: CostSnapshot): void {
  expect(snapshot.accruedCostUsd).toBe(0);
  expect(Number.isNaN(Date.parse(snapshot.fetchedAt))).toBe(false);
}

export function expectBraveSearchAuthCall(
  fetcher: unknown,
  urlSubstring: string,
  apiKey = 'brave-key',
): void {
  expect(fetcher).toHaveBeenCalledWith(
    expect.objectContaining({
      href: expect.stringContaining(urlSubstring),
    }),
    expect.objectContaining({
      headers: expect.objectContaining({
        'x-subscription-token': apiKey,
      }),
    }),
  );
}

export function fetchBraveQuotaSnapshot(
  headers: Record<string, string>,
  now: Date,
): Promise<CostSnapshot> {
  return fetchBraveCostSnapshot({
    apiKey: 'key',
    unitCostUsd: 1,
    fetch: vi.fn().mockResolvedValue(braveTestResponse(headers)),
    now,
  });
}
