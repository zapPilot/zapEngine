import { getTableName } from '../../config/database.js';
import { BaseWriter } from '../../core/database/baseWriter.js';
import { buildTokenPriceInsertValues } from '../../core/database/columnDefinitions.js';
import type { TokenPriceData } from '../../modules/token-price/schema.js';
import { formatDateToYYYYMMDD } from '../../utils/dateUtils.js';
import { toErrorMessage } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

function normalizeSnapshotDateValue(snapshotDate: Date | string): Date {
  return snapshotDate instanceof Date ? snapshotDate : new Date(snapshotDate);
}

export class TokenPriceWriter extends BaseWriter<TokenPriceData> {
  private static readonly DEFAULT_TOKEN_SYMBOL = 'BTC';

  /**
   * Insert token price snapshot (upsert on conflict)
   *
   * Uses ON CONFLICT to update existing snapshot if one exists for the same source/token/date
   */
  async insertSnapshot(data: TokenPriceData): Promise<void> {
    const snapshotDate = formatDateToYYYYMMDD(data.timestamp);

    try {
      const result = await this.executeBatchWrite({
        batchNumber: 1,
        logContext: 'token price snapshot',
        recordCount: 1,
        buildQuery: () => {
          const { columns, placeholders, values } = buildTokenPriceInsertValues(
            [data],
          );
          const query = `
            INSERT INTO ${this.getSnapshotsTableName()} (${columns.join(', ')})
            VALUES ${placeholders}
            ON CONFLICT (source, token_symbol, snapshot_date)
            DO UPDATE SET
              price_usd = EXCLUDED.price_usd,
              market_cap_usd = EXCLUDED.market_cap_usd,
              volume_24h_usd = EXCLUDED.volume_24h_usd,
              token_id = EXCLUDED.token_id,
              snapshot_time = EXCLUDED.snapshot_time,
              raw_data = EXCLUDED.raw_data
            RETURNING id, snapshot_date
          `;
          return { query, values };
        },
      });

      if (!result.success) {
        throw new Error(result.errors[0] ?? 'Unknown insert error');
      }

      logger.info('Token price snapshot saved', {
        tokenSymbol: data.tokenSymbol,
        tokenId: data.tokenId,
        price: data.priceUsd,
        source: data.source,
        date: snapshotDate,
      });
    } catch (error) {
      logger.error('Failed to save token price snapshot', {
        error: toErrorMessage(error),
        date: snapshotDate,
        tokenSymbol: data.tokenSymbol,
        tokenId: data.tokenId,
        price: data.priceUsd,
      });
      throw error;
    }
  }

  /**
   * Batch insert historical snapshots
   *
   * Inserts multiple snapshots in a single query with ON CONFLICT DO NOTHING
   * Continues on failure to maximize data collection
   */
  async insertBatch(snapshots: TokenPriceData[]): Promise<number> {
    if (snapshots.length === 0) {
      return 0;
    }
    const tokenSymbol = snapshots[0]?.tokenSymbol ?? 'UNKNOWN';
    logger.info('Starting batch insert', {
      total: snapshots.length,
      tokenSymbol,
    });

    const { columns, placeholders, values } =
      buildTokenPriceInsertValues(snapshots);
    const query = `
      INSERT INTO ${this.getSnapshotsTableName()} (
        ${columns.join(', ')}
      )
      VALUES ${placeholders}
      ON CONFLICT (source, token_symbol, snapshot_date) DO NOTHING
      RETURNING id;
    `;

    try {
      const queryResult = await this.withDatabaseClient((client) =>
        client.query(query, values),
      );
      const inserted = queryResult.rowCount ?? queryResult.rows?.length ?? 0;
      const successRate = `${((inserted / snapshots.length) * 100).toFixed(1)}%`;
      logger.info('Batch insert completed', {
        total: snapshots.length,
        tokenSymbol,
        inserted,
        failed: snapshots.length - inserted,
        successRate,
      });
      return inserted;
    } catch (error) {
      logger.error('Batch insert failed', {
        tokenSymbol,
        total: snapshots.length,
        error: toErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Get the most recent token price snapshot from database
   */
  async getLatestSnapshot(
    tokenSymbol: string = TokenPriceWriter.DEFAULT_TOKEN_SYMBOL,
  ): Promise<{ date: string; price: number; tokenSymbol: string } | null> {
    const tableName = this.getSnapshotsTableName();
    const query = `
      SELECT snapshot_date, price_usd, token_symbol
      FROM ${tableName}
      WHERE source = 'coingecko' AND token_symbol = $1
      ORDER BY snapshot_date DESC
      LIMIT 1
    `;
    try {
      const result = await this.withDatabaseClient((client) =>
        client.query(query, [tokenSymbol]),
      );
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
      return {
        date: formatDateToYYYYMMDD(
          normalizeSnapshotDateValue(row.snapshot_date),
        ),
        price: Number.parseFloat(row.price_usd),
        tokenSymbol: row.token_symbol,
      };
    } catch (error) {
      logger.error('Failed to get latest snapshot', {
        tokenSymbol,
        error: toErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Count total token price snapshots in database
   */
  async getSnapshotCount(
    tokenSymbol: string = TokenPriceWriter.DEFAULT_TOKEN_SYMBOL,
  ): Promise<number> {
    const tableName = this.getSnapshotsTableName();
    const query = `
      SELECT COUNT(*) as count
      FROM ${tableName}
      WHERE source = 'coingecko' AND token_symbol = $1
    `;
    try {
      const result = await this.withDatabaseClient((client) =>
        client.query(query, [tokenSymbol]),
      );
      return Number.parseInt(result.rows[0]?.count ?? '0', 10);
    } catch (error) {
      logger.error('Failed to get snapshot count', {
        tokenSymbol,
        error: toErrorMessage(error),
      });
      return 0;
    }
  }

  /**
   * Get existing snapshot dates within a date range
   * Used for gap detection before backfilling historical data
   */
  async getExistingDatesInRange(
    startDate: Date,
    endDate: Date,
    tokenSymbol: string = TokenPriceWriter.DEFAULT_TOKEN_SYMBOL,
    source = 'coingecko',
  ): Promise<string[]> {
    const tableName = this.getSnapshotsTableName();
    const query = `
      SELECT to_char(snapshot_date, 'YYYY-MM-DD') as snapshot_date
      FROM ${tableName}
      WHERE source = $1
        AND token_symbol = $2
        AND snapshot_date >= $3
        AND snapshot_date <= $4
      ORDER BY snapshot_date ASC
    `;
    const startDateStr = formatDateToYYYYMMDD(startDate);
    const endDateStr = formatDateToYYYYMMDD(endDate);
    try {
      const result = await this.withDatabaseClient((client) =>
        client.query(query, [source, tokenSymbol, startDateStr, endDateStr]),
      );
      // PostgreSQL to_char() returns strings in YYYY-MM-DD format.
      const dates = result.rows.map(
        (row: { snapshot_date: string }) => row.snapshot_date,
      );
      logger.info('Retrieved existing snapshots in range', {
        tokenSymbol,
        source,
        startDate: startDateStr,
        endDate: endDateStr,
        count: dates.length,
      });
      return dates;
    } catch (error) {
      logger.error('Failed to get existing dates in range', {
        tokenSymbol,
        source,
        error: toErrorMessage(error),
      });
      return []; // Fallback to full fetch on error
    }
  }

  private getSnapshotsTableName(): string {
    return getTableName('TOKEN_PRICE_SNAPSHOTS');
  }
}
