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
  private static readonly DMA_WINDOW_SIZE = 200;
  private static readonly SOURCE = 'yahoo-finance';
  private static readonly DEFAULT_SYMBOL = 'SPY';

  constructor(pool?: Pool) {
    this.pool = pool ?? getDbPool();
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
  ): Promise<{
    date: string;
    price: number;
    dma200: number | null;
    isAboveDma: boolean | null;
  } | null> {
    const tableName = getTableName('STOCK_PRICE_DMA_SNAPSHOTS');
    const query = `
      SELECT snapshot_date, price_usd, dma_200, is_above_dma
      FROM ${tableName}
      WHERE source = 'alphavantage' AND symbol = $1
      ORDER BY snapshot_date DESC
      LIMIT 1
    `;

    try {
      const result = await this.pool.query<{
        snapshot_date: string;
        price_usd: string;
        dma_200: string | null;
        is_above_dma: boolean | null;
      }>(query, [symbol]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0]!;
      return {
        date: row.snapshot_date,
        price: Number.parseFloat(row.price_usd),
        dma200: row.dma_200 !== null ? Number.parseFloat(row.dma_200) : null,
        isAboveDma: row.is_above_dma,
      };
    } catch (error) {
      logger.error('Failed to get latest DMA snapshot', {
        symbol,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
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

    return prices.map((row, index) => {
      const windowStart = Math.max(0, index - windowSize + 1);
      const window = prices.slice(windowStart, index + 1);
      const daysAvailable = window.length;

      let dma200: number | null = null;
      let priceVsDmaRatio: number | null = null;
      let isAboveDma: boolean | null = null;

      if (daysAvailable >= windowSize) {
        const sum = window.reduce((acc, p) => acc + p.price_usd, 0);
        dma200 = sum / windowSize;
        priceVsDmaRatio = row.price_usd / dma200;
        isAboveDma = row.price_usd > dma200;
      }

      return {
        symbol: row.symbol,
        snapshot_date: row.snapshot_date,
        price_usd: row.price_usd,
        dma_200: dma200,
        price_vs_dma_ratio: priceVsDmaRatio,
        is_above_dma: isAboveDma,
        days_available: daysAvailable,
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

    const tableName = getTableName('STOCK_PRICE_DMA_SNAPSHOTS');
    const columns = [
      'symbol',
      'snapshot_date',
      'price_usd',
      'dma_200',
      'price_vs_dma_ratio',
      'is_above_dma',
      'days_available',
      'source',
      'snapshot_time',
      'created_at',
    ];

    logger.info('Building DMA insert query', {
      snapshotCount: snapshots.length,
      columns: columns.length,
      firstSnapshot: snapshots[0] ? JSON.stringify(snapshots[0]) : 'undefined',
    });

    try {
      // Batch insert in chunks to avoid PostgreSQL parameter limit (max ~32767)
      const BATCH_SIZE = 1000;
      let totalInserted = 0;

      for (let i = 0; i < snapshots.length; i += BATCH_SIZE) {
        const batch = snapshots.slice(i, i + BATCH_SIZE);
        const batchPlaceholders: string[] = [];
        const batchValues: unknown[] = [];

        batch.forEach((snapshot, idx) => {
          const offset = idx * 10;
          batchPlaceholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`,
          );
          batchValues.push(
            snapshot.symbol,
            snapshot.snapshot_date,
            snapshot.price_usd,
            snapshot.dma_200,
            snapshot.price_vs_dma_ratio,
            snapshot.is_above_dma,
            snapshot.days_available,
            snapshot.source,
            snapshot.snapshot_time,
            snapshot.created_at,
          );
        });

        const batchQuery = `
        INSERT INTO ${tableName} (${columns.join(', ')})
        VALUES ${batchPlaceholders.join(', ')}
        ON CONFLICT (source, symbol, snapshot_date)
        DO UPDATE SET
          price_usd = EXCLUDED.price_usd,
          dma_200 = EXCLUDED.dma_200,
          price_vs_dma_ratio = EXCLUDED.price_vs_dma_ratio,
          is_above_dma = EXCLUDED.is_above_dma,
          days_available = EXCLUDED.days_available,
          snapshot_time = EXCLUDED.snapshot_time
        RETURNING id;
      `;

        const result = await this.pool.query({
          text: batchQuery,
          values: batchValues,
        });
        totalInserted += result.rowCount ?? 0;

        logger.info('Batch inserted', {
          batchIndex: i / BATCH_SIZE,
          batchSize: batch.length,
          inserted: result.rowCount,
        });
      }

      return { recordsInserted: totalInserted };
    } catch (error) {
      logger.error('Failed to write DMA snapshots', {
        jobId,
        symbol,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
