import type {
  TokenPairRatioDmaSnapshotInsert,
  TokenPriceDmaSnapshotInsert
} from '../../types/database.js';

export interface PriceRow {
  token_symbol: string;
  token_id: string;
  snapshot_date: string;
  price_usd: number;
}

export interface PairRatioContext {
  baseTokenSymbol: string;
  baseTokenId: string;
  quoteTokenSymbol: string;
  quoteTokenId: string;
}

export interface PairRatioRow {
  base_token_symbol: string;
  base_token_id: string;
  quote_token_symbol: string;
  quote_token_id: string;
  snapshot_date: string;
  ratio_value: number;
}

interface RollingSeriesRow {
  snapshot_date: string;
  value: number;
}

interface RollingDmaMetric {
  dma200: number | null;
  ratioVsDma: number | null;
  isAboveDma: boolean | null;
  daysAvailable: number;
}

export const DMA_WINDOW_SIZE = 200;
export const DMA_SOURCE = 'coingecko';
export const ETH_BTC_RATIO_CONTEXT: PairRatioContext = {
  baseTokenSymbol: 'ETH',
  baseTokenId: 'ethereum',
  quoteTokenSymbol: 'BTC',
  quoteTokenId: 'bitcoin'
};

export function computeDma(
  prices: PriceRow[],
  windowSize: number = DMA_WINDOW_SIZE
): TokenPriceDmaSnapshotInsert[] {
  const now = new Date().toISOString();
  const metrics = computeRollingDmaMetrics(
    prices.map((row) => ({
      snapshot_date: row.snapshot_date,
      value: row.price_usd
    })),
    windowSize
  );

  return prices.map((row, index) => {
    const metric = metrics[index];

    return {
      token_symbol: row.token_symbol,
      token_id: row.token_id,
      snapshot_date: row.snapshot_date,
      price_usd: row.price_usd,
      /* v8 ignore start -- metrics array always matches input length from computeRollingDmaMetrics */
      dma_200: metric?.dma200 ?? null,
      price_vs_dma_ratio: metric?.ratioVsDma ?? null,
      is_above_dma: metric?.isAboveDma ?? null,
      days_available: metric?.daysAvailable ?? 0,
      /* v8 ignore stop */
      source: DMA_SOURCE,
      snapshot_time: now,
    };
  });
}

export function buildAlignedPairRatioSeries(
  basePrices: PriceRow[],
  quotePrices: PriceRow[],
  pairContext: PairRatioContext = ETH_BTC_RATIO_CONTEXT
): PairRatioRow[] {
  const quoteByDate = new Map(
    quotePrices.map((row) => [row.snapshot_date, row])
  );

  return basePrices.flatMap((baseRow) => {
    const quoteRow = quoteByDate.get(baseRow.snapshot_date);
    if (!quoteRow || quoteRow.price_usd <= 0) {
      return [];
    }

    return [{
      base_token_symbol: pairContext.baseTokenSymbol,
      base_token_id: pairContext.baseTokenId,
      quote_token_symbol: pairContext.quoteTokenSymbol,
      quote_token_id: pairContext.quoteTokenId,
      snapshot_date: baseRow.snapshot_date,
      ratio_value: baseRow.price_usd / quoteRow.price_usd
    }];
  });
}

export function computeTokenPairRatioDma(
  ratios: PairRatioRow[],
  windowSize: number = DMA_WINDOW_SIZE
): TokenPairRatioDmaSnapshotInsert[] {
  const now = new Date().toISOString();
  const metrics = computeRollingDmaMetrics(
    ratios.map((row) => ({
      snapshot_date: row.snapshot_date,
      value: row.ratio_value
    })),
    windowSize
  );

  return ratios.map((row, index) => {
    const metric = metrics[index];

    return {
      base_token_symbol: row.base_token_symbol,
      base_token_id: row.base_token_id,
      quote_token_symbol: row.quote_token_symbol,
      quote_token_id: row.quote_token_id,
      snapshot_date: row.snapshot_date,
      ratio_value: row.ratio_value,
      /* v8 ignore start -- metrics array always matches input length from computeRollingDmaMetrics */
      dma_200: metric?.dma200 ?? null,
      ratio_vs_dma_ratio: metric?.ratioVsDma ?? null,
      is_above_dma: metric?.isAboveDma ?? null,
      days_available: metric?.daysAvailable ?? 0,
      /* v8 ignore stop */
      source: DMA_SOURCE,
      snapshot_time: now,
    };
  });
}

function computeRollingDmaMetrics(
  rows: RollingSeriesRow[],
  windowSize: number
): RollingDmaMetric[] {
  return rows.map((row, index) => {
    const windowStart = Math.max(0, index - windowSize + 1);
    const window = rows.slice(windowStart, index + 1);
    const daysAvailable = window.length;
    const dma = calculateDma(window, daysAvailable, windowSize);

    return {
      dma200: dma,
      ratioVsDma: dma !== null ? row.value / dma : null,
      isAboveDma: dma !== null ? row.value > dma : null,
      daysAvailable
    };
  });
}

function calculateDma(window: RollingSeriesRow[], daysAvailable: number, windowSize: number): number | null {
  if (daysAvailable < windowSize) {
    return null;
  }

  return window.reduce((sum, row) => sum + row.value, 0) / windowSize;
}
