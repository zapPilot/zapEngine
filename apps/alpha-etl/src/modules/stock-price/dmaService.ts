/**
 * Stock Price DMA Service
 *
 * Computes 200-day simple moving average (SMA) from stock price data.
 * Reads from stock_price_snapshots, computes DMA, writes to stock_price_dma_snapshots.
 *
 * This is a "derived data" service — reads from DB rather than external API.
 * Called as a post-step by StockPriceETLProcessor after fresh prices are written.
 *
 * Data Source: alpha_raw.stock_price_snapshots (internal)
 * Target: alpha_raw.stock_price_dma_snapshots
 */

import type { Pool } from 'pg';

import { getDbPool, getTableName } from '../../config/database.js';
import type { LatestDmaSnapshot } from '../../modules/core/dmaSnapshot.js';
import { StockPriceDmaWriter } from '../../modules/stock-price/dmaWriter.js';
import { computeRollingDmaMetrics } from '../../modules/token-price/dmaCalculator.js';
import { logger } from '../../utils/logger.js';

export interface StockPriceDmaSnapshotInsert {
  symbol: string;
  snapshot_date: string;
  price_usd: number;
  dma_200: number | null;
  price_vs_dma_ratio: number | null;
  is_above_dma: boolean | null;
  days_available: number;
  source: string;
  snapshot_time: string;
  created_at: string;
}

export interface StockPriceRow {
  symbol: string;
  snapshot_date: string;
  price_usd: number;
}

export class StockPriceDmaService {
  private pool: Pool;
  private writer: StockPriceDmaWriter;
  private static readonly DMA_WINDOW_SIZE = 200;
  private static readonly SOURCE = 'yahoo-finance';
  private static readonly DEFAULT_SYMBOL = 'SPY';

  constructor(pool?: Pool) {
    this.pool = pool ?? getDbPool();
    this.writer = new StockPriceDmaWriter();
  }

  async updateDmaForSymbol(
    symbol: string = StockPriceDmaService.DEFAULT_SYMBOL,
    jobId?: string,
  ): Promise<{ recordsInserted: number }> {
    const correlationId = jobId ?? `dma-${symbol}-${Date.now()}`;

    logger.info('Starting DMA computation post-step', {
      jobId: correlationId,
      symbol,
    });

    const prices = await this.fetchPricesForSymbol(symbol);
    if (prices.length === 0) {
      logger.info('No price history found for DMA computation', {
        jobId: correlationId,
        symbol,
      });
      return { recordsInserted: 0 };
    }

    const dmaSnapshots = this.computeDma(
      prices,
      StockPriceDmaService.DMA_WINDOW_SIZE,
    );
    const writeResult = await this.writeDmaSnapshots(
      dmaSnapshots,
      correlationId,
      symbol,
    );

    logger.info('DMA computation post-step completed', {
      jobId: correlationId,
      symbol,
      recordsInserted: writeResult.recordsInserted,
    });

    return writeResult;
  }

  async getLatestDmaSnapshot(
    symbol: string = StockPriceDmaService.DEFAULT_SYMBOL,
  ): Promise<LatestDmaSnapshot | null> {
    return this.writer.getLatestDmaSnapshot(symbol);
  }

  private async fetchPricesForSymbol(symbol: string): Promise<StockPriceRow[]> {
    const query = `
      SELECT symbol,
             to_char(snapshot_date, 'YYYY-MM-DD') as snapshot_date,
             price_usd
      FROM ${getTableName('STOCK_PRICE_SNAPSHOTS')}
      WHERE source = $1 AND symbol = $2
      ORDER BY snapshot_date ASC
    `;

    const result = await this.pool.query<{
      symbol: string;
      snapshot_date: string;
      price_usd: string;
    }>(query, [StockPriceDmaService.SOURCE, symbol]);

    return result.rows.map((row) => ({
      symbol: row.symbol,
      snapshot_date: row.snapshot_date,
      price_usd: Number.parseFloat(row.price_usd),
    }));
  }

  private computeDma(
    prices: StockPriceRow[],
    windowSize: number = StockPriceDmaService.DMA_WINDOW_SIZE,
  ): StockPriceDmaSnapshotInsert[] {
    const now = new Date().toISOString();

    const metrics = computeRollingDmaMetrics(
      prices.map((row) => ({
        snapshot_date: row.snapshot_date,
        value: row.price_usd,
      })),
      windowSize,
    );

    return prices.map((row, index) => {
      const metric = metrics[index];

      return {
        symbol: row.symbol,
        snapshot_date: row.snapshot_date,
        price_usd: row.price_usd,
        dma_200: metric?.dma200 ?? null,
        price_vs_dma_ratio: metric?.ratioVsDma ?? null,
        is_above_dma: metric?.isAboveDma ?? null,
        days_available: metric?.daysAvailable ?? 0,
        source: StockPriceDmaService.SOURCE,
        snapshot_time: now,
        created_at: now,
      };
    });
  }

  private async writeDmaSnapshots(
    snapshots: StockPriceDmaSnapshotInsert[],
    jobId: string,
    symbol: string,
  ): Promise<{ recordsInserted: number }> {
    if (snapshots.length === 0) {
      return { recordsInserted: 0 };
    }

    logger.info('Writing DMA snapshots to database', {
      jobId,
      symbol,
      recordCount: snapshots.length,
    });

    const writeResult = await this.writer.writeDmaSnapshots(snapshots);

    if (!writeResult.success) {
      const errorMessage = writeResult.errors[0] ?? 'DMA write failed';
      logger.error('Failed to write DMA snapshots', {
        jobId,
        symbol,
        error: errorMessage,
      });
      throw new Error(errorMessage);
    }

    return { recordsInserted: writeResult.recordsInserted };
  }
}
