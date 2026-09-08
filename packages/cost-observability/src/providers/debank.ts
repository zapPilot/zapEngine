import { z } from 'zod';

import { currentUtcPeriod, projectMonthEnd } from '../time.js';
import type { CostSnapshot, FetchLike } from '../types.js';
import { normalizeNonNegative, roundUsageUsd } from './numbers.js';

const responseSchema = z.object({
  balance: z.number().nonnegative(),
  stats: z.array(
    z.object({
      usage: z.number().nonnegative(),
      remains: z.number().nonnegative(),
      date: z.iso.date(),
    }),
  ),
});

export interface DeBankCostInput {
  apiKey: string;
  unitCostUsd?: number;
  fetch?: FetchLike;
  now?: Date;
  baseUrl?: string;
  /**
   * Previous calendar month's DeBank total, read from the caller's own
   * persisted ledger. It damps the month-end projection over the first week,
   * where extrapolating a single day of unit consumption is meaningless.
   * Omitting it falls back to plain linear extrapolation. It cannot rescue an
   * unknown `unitCostUsd`: without a unit price there is no accrued figure to
   * project from, and both accrued and projected stay null.
   */
  priorMonthTotalUsd?: number | null;
}

export async function fetchDeBankCostSnapshot(
  input: DeBankCostInput,
): Promise<CostSnapshot> {
  const now = input.now ?? new Date();
  const fetcher = input.fetch ?? globalThis.fetch;
  const baseUrl = input.baseUrl ?? 'https://pro-openapi.debank.com/v1';
  const response = await fetcher(`${baseUrl}/account/units`, {
    headers: { AccessKey: input.apiKey, accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`DeBank units request failed (${response.status})`);
  }

  const data = responseSchema.parse(await response.json());
  const monthPrefix = now.toISOString().slice(0, 7);
  const today = now.toISOString().slice(0, 10);
  const consumed = data.stats
    .filter((entry) => entry.date.startsWith(monthPrefix))
    .reduce((sum, entry) => sum + entry.usage, 0);
  const todayUsage =
    data.stats.find((entry) => entry.date === today)?.usage ?? 0;
  const unitCostUsd = normalizeNonNegative(input.unitCostUsd);
  const accruedCostUsd =
    unitCostUsd === null ? null : roundUsageUsd(consumed * unitCostUsd);

  return {
    provider: 'debank',
    ...currentUtcPeriod(now),
    usage: [
      {
        key: 'monthly_units',
        label: 'Units consumed',
        unit: 'units',
        value: consumed,
      },
      {
        key: 'today_units',
        label: 'Units today',
        unit: 'units',
        value: todayUsage,
      },
      {
        key: 'remaining_units',
        label: 'Units remaining',
        unit: 'units',
        value: data.balance,
      },
    ],
    accruedCostUsd,
    projectedCostUsd:
      accruedCostUsd === null
        ? null
        : projectMonthEnd(accruedCostUsd, now, input.priorMonthTotalUsd),
    costType: 'list-price-equivalent',
    source: 'api',
    fetchedAt: now.toISOString(),
  };
}
