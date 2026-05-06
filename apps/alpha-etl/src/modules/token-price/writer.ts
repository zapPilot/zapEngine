import { getTableName } from '../../config/database.js';
import { BaseWriter } from '../../core/database/baseWriter.js';
import { buildTokenPriceInsertValues } from '../../core/database/columnDefinitions.js';
import type { TokenPriceData } from '../../modules/token-price/schema.js';
import { formatDateToYYYYMMDD } from '../../utils/dateUtils.js';
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

      this.assertWriteSuccess(result, 'Unknown insert error');

      logger.info('Token price snapshot saved', {
        tokenSymbol: data.tokenSymbol,
        tokenId: data.tokenId,
        price: data.priceUsd,
        source: data.source,
        date: snapshotDate,
      });
    } catch (error) {
      this.logWriteFailureAndRethrow(
        'Failed to save token price snapshot',
        {
          date: snapshotDate,
          tokenSymbol: data.tokenSymbol,
          tokenId: data.tokenId,
          price: data.priceUsd,
        },
        error,
      );
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

    return this.executeStandardBatchInsert(query, values, snapshots.length, {
      tokenSymbol,
    });
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
    const row = await this.queryOptionalRow<{
      snapshot_date: string;
      price_usd: string;
      token_symbol: string;
    }>({
      query,
      values: [tokenSymbol],
      failureMessage: 'Failed to get latest snapshot',
      failureContext: { tokenSymbol },
    });

    if (!row) {
      return null;
    }

    try {
      return {
        date: formatDateToYYYYMMDD(
          normalizeSnapshotDateValue(row.snapshot_date),
        ),
        price: Number.parseFloat(row.price_usd),
        tokenSymbol: row.token_symbol,
      };
    } catch (error) {
      logger.error('Failed to map latest token snapshot', {
        tokenSymbol,
        error,
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
    return this.queryCountOrZero({
      query,
      values: [tokenSymbol],
      failureMessage: 'Failed to get snapshot count',
      failureContext: {
        tokenSymbol,
      },
    });
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
    return this.queryEntitySnapshotDatesForDates(
      this.getSnapshotsTableName(),
      'token_symbol',
      tokenSymbol,
      source,
      startDate,
      endDate,
      {
        tokenSymbol,
      },
    );
  }

  private getSnapshotsTableName(): string {
    return getTableName('TOKEN_PRICE_SNAPSHOTS');
  }
}
