import { currentUtcPeriod } from '../time.js';
import type { CostProvider, CostSnapshot } from '../types.js';

export interface FixedMonthlyCostInput {
  provider: CostProvider;
  monthlyCostUsd: number;
  now?: Date;
  usageLabel?: string;
}

export function createFixedMonthlyCostSnapshot(
  input: FixedMonthlyCostInput,
): CostSnapshot {
  if (!Number.isFinite(input.monthlyCostUsd) || input.monthlyCostUsd < 0) {
    throw new Error('Fixed monthly cost must be a non-negative number');
  }
  const now = input.now ?? new Date();
  return {
    provider: input.provider,
    ...currentUtcPeriod(now),
    usage: [
      {
        key: 'monthly_plan',
        label: input.usageLabel ?? 'Monthly plan',
        unit: 'usd',
        value: input.monthlyCostUsd,
      },
    ],
    accruedCostUsd: input.monthlyCostUsd,
    projectedCostUsd: input.monthlyCostUsd,
    costType: 'fixed',
    source: 'fixed',
    fetchedAt: now.toISOString(),
  };
}
