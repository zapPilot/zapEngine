export type IncomeProtocolClass = 'passive' | 'strategy';

export const AVG_DAYS_PER_MONTH = 30.4;

export function classifyIncomeProtocol(name: string): IncomeProtocolClass {
  const normalized = name.toLowerCase();
  return normalized.includes('gmx') || normalized.includes('hyperliquid')
    ? 'strategy'
    : 'passive';
}

export function estimateMonthlyIncomeUsd(averageDailyUsd: number): number {
  return averageDailyUsd * AVG_DAYS_PER_MONTH;
}
