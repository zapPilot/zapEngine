import type {
  TokenPairRatioDmaSnapshotInsert,
  TokenPriceDmaSnapshotInsert,
} from '../../types/database.js';
import {
  buildRollingDmaSnapshots,
  mapRollingMetric,
} from '../core/dmaRolling.js';

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

export const DMA_WINDOW_SIZE = 200;
export const DMA_SOURCE = 'coingecko';
export const ETH_BTC_RATIO_CONTEXT: PairRatioContext = {
  baseTokenSymbol: 'ETH',
  baseTokenId: 'ethereum',
  quoteTokenSymbol: 'BTC',
  quoteTokenId: 'bitcoin',
};

export function computeDma(
  prices: PriceRow[],
  windowSize: number = DMA_WINDOW_SIZE,
): TokenPriceDmaSnapshotInsert[] {
  return buildRollingDmaSnapshots(
    prices,
    windowSize,
    (row) => row.price_usd,
    (row, metric, now) => ({
      token_symbol: row.token_symbol,
      token_id: row.token_id,
      snapshot_date: row.snapshot_date,
      price_usd: row.price_usd,
      /* v8 ignore start -- metrics array always matches input length from computeRollingDmaMetrics */
      ...mapRollingMetric(metric, 'price_vs_dma_ratio'),
      /* v8 ignore stop */
      source: DMA_SOURCE,
      snapshot_time: now,
    }),
  );
}

export function buildAlignedPairRatioSeries(
  basePrices: PriceRow[],
  quotePrices: PriceRow[],
  pairContext: PairRatioContext = ETH_BTC_RATIO_CONTEXT,
): PairRatioRow[] {
  const quoteByDate = new Map(
    quotePrices.map((row) => [row.snapshot_date, row]),
  );

  return basePrices.flatMap((baseRow) => {
    const quoteRow = quoteByDate.get(baseRow.snapshot_date);
    if (!quoteRow || quoteRow.price_usd <= 0) {
      return [];
    }

    return [
      {
        base_token_symbol: pairContext.baseTokenSymbol,
        base_token_id: pairContext.baseTokenId,
        quote_token_symbol: pairContext.quoteTokenSymbol,
        quote_token_id: pairContext.quoteTokenId,
        snapshot_date: baseRow.snapshot_date,
        ratio_value: baseRow.price_usd / quoteRow.price_usd,
      },
    ];
  });
}

export function computeTokenPairRatioDma(
  ratios: PairRatioRow[],
  windowSize: number = DMA_WINDOW_SIZE,
): TokenPairRatioDmaSnapshotInsert[] {
  return buildRollingDmaSnapshots(
    ratios,
    windowSize,
    (row) => row.ratio_value,
    (row, metric, now) => ({
      base_token_symbol: row.base_token_symbol,
      base_token_id: row.base_token_id,
      quote_token_symbol: row.quote_token_symbol,
      quote_token_id: row.quote_token_id,
      snapshot_date: row.snapshot_date,
      ratio_value: row.ratio_value,
      /* v8 ignore start -- metrics array always matches input length from computeRollingDmaMetrics */
      ...mapRollingMetric(metric, 'ratio_vs_dma_ratio'),
      /* v8 ignore stop */
      source: DMA_SOURCE,
      snapshot_time: now,
    }),
  );
}
