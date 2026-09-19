export const AVG_DAYS_PER_MONTH = 30.4;

export function estimateMonthlyIncomeUsd(averageDailyUsd: number): number {
  return averageDailyUsd * AVG_DAYS_PER_MONTH;
}
