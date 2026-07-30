export interface RollingSeriesRow {
  snapshot_date: string;
  value: number;
}

export interface RollingDmaMetric {
  dma200: number | null;
  ratioVsDma: number | null;
  isAboveDma: boolean | null;
  daysAvailable: number;
}

export function mapRollingMetric<
  RatioKey extends 'price_vs_dma_ratio' | 'ratio_vs_dma_ratio',
>(
  metric: RollingDmaMetric | undefined,
  ratioKey: RatioKey,
): {
  dma_200: number | null;
  is_above_dma: boolean | null;
  days_available: number;
} & Record<RatioKey, number | null> {
  return {
    dma_200: metric?.dma200 ?? null,
    [ratioKey]: metric?.ratioVsDma ?? null,
    is_above_dma: metric?.isAboveDma ?? null,
    days_available: metric?.daysAvailable ?? 0,
  } as {
    dma_200: number | null;
    is_above_dma: boolean | null;
    days_available: number;
  } & Record<RatioKey, number | null>;
}

export function buildRollingDmaSnapshots<
  TRow extends { snapshot_date: string },
  TOut,
>(
  rows: TRow[],
  windowSize: number,
  getSeriesValue: (row: TRow) => number,
  project: (
    row: TRow,
    metric: RollingDmaMetric | undefined,
    now: string,
  ) => TOut,
): TOut[] {
  const now = new Date().toISOString();
  const metrics = computeRollingDmaMetrics(
    rows.map((row) => ({
      snapshot_date: row.snapshot_date,
      value: getSeriesValue(row),
    })),
    windowSize,
  );

  return rows.map((row, index) => project(row, metrics[index], now));
}

function computeRollingDmaMetrics(
  rows: RollingSeriesRow[],
  windowSize: number,
): RollingDmaMetric[] {
  return rows.map((row, index) => {
    const windowStart = Math.max(0, index - windowSize + 1);
    const window = rows.slice(windowStart, index + 1);
    const daysAvailable = window.length;
    const dma = calculateDma(window, daysAvailable, windowSize);

    if (dma === null) {
      return {
        dma200: null,
        ratioVsDma: null,
        isAboveDma: null,
        daysAvailable,
      };
    }

    return {
      dma200: dma,
      ratioVsDma: row.value / dma,
      isAboveDma: row.value > dma,
      daysAvailable,
    };
  });
}

function calculateDma(
  window: RollingSeriesRow[],
  daysAvailable: number,
  windowSize: number,
): number | null {
  if (daysAvailable < windowSize) {
    return null;
  }

  return window.reduce((sum, row) => sum + row.value, 0) / windowSize;
}
