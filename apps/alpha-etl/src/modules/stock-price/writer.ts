/**
 * Stock Price Writer
 *
 * Database writer for stock price snapshots.
 * Mirrors TokenPriceWriter pattern but simplified for stock data.
 */

import { getTableName } from '../../config/database.js';
import { BaseWriter } from '../../core/database/baseWriter.js';
import { formatDateToYYYYMMDD } from '../../utils/dateUtils.js';
import { toErrorMessage } from '../../utils/errors.js';
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
          const columns = [
            'symbol',
            'snapshot_date',
            'price_usd',
            'source',
            'created_at',
          ];
          const placeholders = ['$1', '$2', '$3', '$4', '$5'];
          const values = [
            data.symbol,
            snapshotDate,
            data.priceUsd,
            data.source,
            new Date().toISOString(),
          ];

          const query = `
            INSERT INTO ${this.getSnapshotsTableName()} (${columns.join(', ')})
            VALUES (${placeholders.join(', ')})
            ON CONFLICT (source, symbol, snapshot_date)
            DO UPDATE SET price_usd = EXCLUDED.price_usd
            RETURNING id, snapshot_date
          `;

          return { query, values };
        },
      });

      if (!result.success) {
        throw new Error(result.errors[0] ?? 'Unknown insert error');
      }

      logger.info('Stock price snapshot saved', {
        symbol: data.symbol,
        price: data.priceUsd,
        source: data.source,
        date: snapshotDate,
      });
    } catch (error) {
      logger.error('Failed to save stock price snapshot', {
        error: toErrorMessage(error),
        date: snapshotDate,
        symbol: data.symbol,
        price: data.priceUsd,
      });
      throw error;
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

    const columns = [
      'symbol',
      'snapshot_date',
      'price_usd',
      'source',
      'created_at',
    ];
    const placeholders: string[] = [];
    const values: unknown[] = [];

    snapshots.forEach((snapshot, index) => {
      const offset = index * 5;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`,
      );
      values.push(
        snapshot.symbol,
        formatDateToYYYYMMDD(snapshot.timestamp),
        snapshot.priceUsd,
        snapshot.source,
        new Date().toISOString(),
      );
    });

    const query = `
      INSERT INTO ${this.getSnapshotsTableName()} (${columns.join(', ')})
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (source, symbol, snapshot_date) DO NOTHING
      RETURNING id;
    `;

    try {
      const queryResult = await this.withDatabaseClient((client) =>
        client.query(query, values),
      );
      const runtimeResult = queryResult as {
        rowCount?: number | null;
        rows?: unknown[];
      };
      const inserted =
        runtimeResult.rowCount ?? runtimeResult.rows?.length ?? 0;
      const successRate = `${((inserted / snapshots.length) * 100).toFixed(1)}%`;
      logger.info('Batch insert completed', {
        total: snapshots.length,
        symbol,
        inserted,
        failed: snapshots.length - inserted,
        successRate,
      });
      return inserted;
    } catch (error) {
      logger.error('Batch insert failed', {
        symbol,
        total: snapshots.length,
        error: toErrorMessage(error),
      });
      throw error;
    }
  }

  async getLatestSnapshot(
    symbol: string = StockPriceWriter.DEFAULT_SYMBOL,
  ): Promise<{ date: string; price: number; symbol: string } | null> {
    const tableName = this.getSnapshotsTableName();
    const query = `
      SELECT snapshot_date, price_usd, symbol
      FROM ${tableName}
      WHERE source = 'alphavantage' AND symbol = $1
      ORDER BY snapshot_date DESC
      LIMIT 1
    `;

    try {
      const result = await this.withDatabaseClient((client) =>
        client.query<{
          snapshot_date: string;
          price_usd: string;
          symbol: string;
        }>(query, [symbol]),
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      return {
        date: row.snapshot_date,
        price: Number.parseFloat(row.price_usd),
        symbol: row.symbol,
      };
    } catch (error) {
      logger.error('Failed to get latest snapshot', {
        symbol,
        error: toErrorMessage(error),
      });
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
      WHERE source = 'alphavantage' AND symbol = $1
    `;

    try {
      const result = await this.withDatabaseClient((client) =>
        client.query<{ count: string }>(query, [symbol]),
      );
      return Number.parseInt(result.rows[0]?.count ?? '0', 10);
    } catch (error) {
      logger.error('Failed to get snapshot count', {
        symbol,
        error: toErrorMessage(error),
      });
      return 0;
    }
  }

  async getExistingDatesInRange(
    startDate: Date,
    endDate: Date,
    symbol: string = StockPriceWriter.DEFAULT_SYMBOL,
    source = 'alphavantage',
  ): Promise<string[]> {
    const tableName = this.getSnapshotsTableName();
    const query = `
      SELECT to_char(snapshot_date, 'YYYY-MM-DD') as snapshot_date
      FROM ${tableName}
      WHERE source = $1
        AND symbol = $2
        AND snapshot_date >= $3
        AND snapshot_date <= $4
      ORDER BY snapshot_date ASC
    `;

    const startDateStr = formatDateToYYYYMMDD(startDate);
    const endDateStr = formatDateToYYYYMMDD(endDate);

    try {
      const result = await this.withDatabaseClient((client) =>
        client.query(query, [source, symbol, startDateStr, endDateStr]),
      );

      const dates = result.rows.map(
        (row: { snapshot_date: string }) => row.snapshot_date,
      );

      logger.info('Retrieved existing snapshots in range', {
        symbol,
        source,
        startDate: startDateStr,
        endDate: endDateStr,
        count: dates.length,
      });

      return dates;
    } catch (error) {
      logger.error('Failed to get existing dates in range', {
        symbol,
        source,
        error: toErrorMessage(error),
      });
      return [];
    }
  }

  private getSnapshotsTableName(): string {
    return getTableName('STOCK_PRICE_SNAPSHOTS');
  }
}
