export const RANGE_OPTIONS = ['3M', '6M', '1Y', 'ALL'] as const;
export type StrategyRange = (typeof RANGE_OPTIONS)[number];

export function strategyBacktestDaysForRange(
  range: StrategyRange,
): number | undefined {
  if (range === '3M') return 90;
  if (range === '6M') return 180;
  if (range === '1Y') return 365;
  return undefined;
}
