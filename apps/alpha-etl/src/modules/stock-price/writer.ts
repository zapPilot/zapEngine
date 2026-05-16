/**
 * Stock Price Writer
 *
 * Database writer for stock price snapshots.
 * Mirrors TokenPriceWriter pattern but simplified for stock data.
 */

import { getTableName } from '../../config/database.js';
import { BaseWriter } from '../../core/database/baseWriter.js';
import { buildStockPriceInsertValues } from '../../core/database/columnDefinitions.js';
import { logger } from '../../utils/logger.js';
import type { DailyStockPrice, StockPriceData } from './schema.js';

export class StockPriceWriter extends BaseWriter<
  DailyStockPrice | StockPriceData
> {
  private static readonly DEFAULT_SYMBOL = 'SPY';

  async insertSnapshot(data: DailyStockPrice): Promise<void> {
    const snapshotDate = data.date;

    try {
      const result = await this.executeBatchWrite({
        batchNumber: 1,
        logContext: 'stock price snapshot',
        recordCount: 1,
        buildQuery: () => {
          const { columns, placeholders, values } = buildStockPriceInsertValues(
            [data],
          );

          const query = `
            INSERT INTO ${this.getSnapshotsTableName()} (${columns.join(', ')})
            VALUES ${placeholders}
            ON CONFLICT (source, symbol, snapshot_date)
            DO UPDATE SET price_usd = EXCLUDED.price_usd
            RETURNING id, snapshot_date
          `;

          return { query, values };
        },
      });

      this.assertWriteSuccess(result, 'Unknown insert error');

      logger.info('Stock price snapshot saved', {
        symbol: data.symbol,
        price: data.priceUsd,
        source: data.source,
        date: snapshotDate,
      });
    } catch (error) {
      this.logWriteFailureAndRethrow(
        'Failed to save stock price snapshot',
        {
          date: snapshotDate,
          symbol: data.symbol,
          price: data.priceUsd,
        },
        error,
      );
    }
  }

  async insertBatch(snapshots: StockPriceData[]): Promise<number> {
    if (snapshots.length === 0) {
      return 0;
    }

    const symbol = snapshots[0]?.symbol ?? 'UNKNOWN';
    logger.info('Starting batch insert', {
      total: snapshots.length,
      symbol,
    });

    const { columns, placeholders, values } =
      buildStockPriceInsertValues(snapshots);

    const query = `
      INSERT INTO ${this.getSnapshotsTableName()} (${columns.join(', ')})
      VALUES ${placeholders}
      ON CONFLICT (source, symbol, snapshot_date) DO NOTHING
      RETURNING id;
    `;

    return this.executeStandardBatchInsert(query, values, snapshots.length, {
      symbol,
    });
  }

  async getLatestSnapshot(
    symbol: string = StockPriceWriter.DEFAULT_SYMBOL,
  ): Promise<{ date: string; price: number; symbol: string } | null> {
    const tableName = this.getSnapshotsTableName();
    const query = `
      SELECT snapshot_date, price_usd, symbol
      FROM ${tableName}
      WHERE source = 'yahoo-finance' AND symbol = $1
      ORDER BY snapshot_date DESC
      LIMIT 1
    `;

    const row = await this.queryOptionalRow<{
      snapshot_date: string;
      price_usd: string;
      symbol: string;
    }>({
      query,
      values: [symbol],
      failureMessage: 'Failed to get latest snapshot',
      failureContext: { symbol },
    });

    if (!row) {
      return null;
    }

    try {
      return {
        date: row.snapshot_date,
        price: Number.parseFloat(row.price_usd),
        symbol: row.symbol,
      };
    } catch (error) {
      logger.error('Failed to map latest stock snapshot', { symbol, error });
      throw error;
    }
  }

  async getSnapshotCount(
    symbol: string = StockPriceWriter.DEFAULT_SYMBOL,
  ): Promise<number> {
    const tableName = this.getSnapshotsTableName();
    const query = `
      SELECT COUNT(*) as count
      FROM ${tableName}
      WHERE source = 'yahoo-finance' AND symbol = $1
    `;

    return this.queryCountOrZero({
      query,
      values: [symbol],
      failureMessage: 'Failed to get snapshot count',
      failureContext: {
        symbol,
      },
    });
  }

  async getExistingDatesInRange(
    startDate: Date,
    endDate: Date,
    symbol: string = StockPriceWriter.DEFAULT_SYMBOL,
    source = 'yahoo-finance',
  ): Promise<string[]> {
    return this.queryEntitySnapshotDatesForDates(
      this.getSnapshotsTableName(),
      'symbol',
      symbol,
      source,
      startDate,
      endDate,
      {
        symbol,
      },
    );
  }

  private getSnapshotsTableName(): string {
    return getTableName('STOCK_PRICE_SNAPSHOTS');
  }
}
