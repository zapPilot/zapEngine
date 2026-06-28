export interface DailyValuePoint {
  date?: string;
  total_value_usd?: number;
  change_percentage?: number;
  pnl_usd?: number;
}

export interface AllocationPoint {
  date?: string;
  category?: string;
  allocation_percentage?: number;
}

export interface YieldReturnPoint {
  yield_return_usd?: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sortedDailyValues(
  dailyValues: DailyValuePoint[] | undefined,
): DailyValuePoint[] {
  return [...(dailyValues ?? [])].sort((a, b) =>
    (a.date ?? '').localeCompare(b.date ?? ''),
  );
}

export function mapDailyValuesToSparkline(
  dailyValues: DailyValuePoint[] | undefined,
): number[] {
  return sortedDailyValues(dailyValues)
    .map((point) => point.total_value_usd)
    .filter(isFiniteNumber);
}

export function calculateWindowReturn(
  dailyValues: DailyValuePoint[] | undefined,
  days: number,
): number | null {
  const sorted = sortedDailyValues(dailyValues).filter((point) =>
    isFiniteNumber(point.total_value_usd),
  );
  const latest = sorted.at(-1);
  if (!latest?.date || !isFiniteNumber(latest.total_value_usd)) {
    return null;
  }

  const latestTs = Date.parse(latest.date);
  const targetTs = latestTs - days * MS_PER_DAY;
  if (Number.isNaN(latestTs)) {
    return null;
  }

  const start =
    sorted
      .filter((point) => {
        if (!point.date) return false;
        const ts = Date.parse(point.date);
        return !Number.isNaN(ts) && ts <= targetTs;
      })
      .at(-1) ?? sorted[0];

  if (!start || !isFiniteNumber(start.total_value_usd)) {
    return null;
  }

  const startValue = start.total_value_usd;
  if (startValue <= 0) {
    return null;
  }

  return ((latest.total_value_usd - startValue) / startValue) * 100;
}

export function sumYieldReturns(
  dailyReturns: YieldReturnPoint[] | undefined,
): number | null {
  const values = (dailyReturns ?? [])
    .map((row) => row.yield_return_usd)
    .filter(isFiniteNumber);
  if (values.length === 0) {
    return null;
  }
  return values.reduce((total, value) => total + value, 0);
}

export function latestAllocationRows<T extends AllocationPoint>(
  allocationRows: T[] | undefined,
): T[] {
  const latestDate = (allocationRows ?? [])
    .map((row) => row.date)
    .filter((date): date is string => Boolean(date))
    .sort((a, b) => a.localeCompare(b))
    .at(-1);

  if (!latestDate) {
    return [];
  }

  return (allocationRows ?? []).filter((row) => row.date === latestDate);
}
