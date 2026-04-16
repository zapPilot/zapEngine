/**
 * Token Price DMA Writer
 *
 * Handles writing 200-day moving average snapshots to the database.
 * Computes derived regime indicators (price vs DMA ratio, above/below flag).
 *
 * Target: token_price_dma_snapshots table
 */

import { logger } from '../../utils/logger.js';
import { toErrorMessage } from '../../utils/errors.js';
import { BaseWriter, type WriteResult } from '../../core/database/baseWriter.js';
import { getTableName } from '../../config/database.js';
import { buildTokenPriceDmaInsertValues } from '../../core/database/columnDefinitions.js';
import { formatDateToYYYYMMDD } from '../../utils/dateUtils.js';
import type { TokenPriceDmaSnapshotInsert } from '../../types/database.js';

interface LatestDmaSnapshotRow {
  snapshot_date: Date | string;
  price_usd: string | number;
  dma_200: string | number | null | undefined;
  is_above_dma: boolean | null;
}

/**
 * Token Price DMA Writer
 *
 * Writes 200-day moving average snapshots with upsert semantics.
 * Upserts on (source, token_symbol, snapshot_date) to allow re-computation.
 */
export class TokenPriceDmaWriter extends BaseWriter<TokenPriceDmaSnapshotInsert> {
  /**
   * Write DMA snapshots to database
   *
   * @param snapshots - Array of DMA snapshot records to upsert
   * @returns Combined write result from all batches
   */
  async writeDmaSnapshots(
    snapshots: TokenPriceDmaSnapshotInsert[]
  ): Promise<WriteResult> {
    logger.debug('Starting DMA snapshots write', {
      snapshotCount: snapshots.length
    });

    return this.processBatches(
      snapshots,
      this.writeBatch.bind(this),
      'DMA snapshots'
    );
  }

  /**
   * Get the latest DMA snapshot for a given token
   *
   * @param tokenSymbol - Token symbol to look up (e.g., 'BTC')
   * @returns Latest DMA snapshot summary, or null if none exists
   */
  async getLatestDmaSnapshot(
    tokenSymbol: string
  ): Promise<{ date: string; price: number; dma200: number | null; isAboveDma: boolean | null } | null> {
    const query = `
      SELECT snapshot_date, price_usd, dma_200, is_above_dma
      FROM ${getTableName('TOKEN_PRICE_DMA_SNAPSHOTS')}
      WHERE source = $1
        AND token_symbol = $2
      ORDER BY snapshot_date DESC
      LIMIT 1
    `;

    try {
      const result = await this.withDatabaseClient((client) =>
        client.query(query, ['coingecko', tokenSymbol])
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0] as LatestDmaSnapshotRow;
      return {
        date: row.snapshot_date instanceof Date
          ? formatDateToYYYYMMDD(row.snapshot_date)
          : String(row.snapshot_date),
        price: parseFloat(String(row.price_usd)),
        dma200: row.dma_200 === null || row.dma_200 === undefined ? null : parseFloat(String(row.dma_200)),
        isAboveDma: row.is_above_dma
      };
    } catch (error) {
      logger.error('Failed to get latest DMA snapshot', {
        tokenSymbol,
        error: toErrorMessage(error)
      });
      return null;
    }
  }

  private async writeBatch(
    batch: TokenPriceDmaSnapshotInsert[],
    batchNumber: number
  ): Promise<WriteResult> {
    return this.executeBatchWrite({
      batchNumber,
      logContext: 'DMA snapshots',
      recordCount: batch.length,
      buildQuery: () => {
        const { columns, placeholders, values } = buildTokenPriceDmaInsertValues(batch);

        const query = `
          INSERT INTO ${getTableName('TOKEN_PRICE_DMA_SNAPSHOTS')} (${columns.join(', ')})
          VALUES ${placeholders}
          ON CONFLICT (source, token_symbol, snapshot_date)
          DO UPDATE SET
            price_usd = EXCLUDED.price_usd,
            dma_200 = EXCLUDED.dma_200,
            price_vs_dma_ratio = EXCLUDED.price_vs_dma_ratio,
            is_above_dma = EXCLUDED.is_above_dma,
            days_available = EXCLUDED.days_available,
            snapshot_time = EXCLUDED.snapshot_time
          RETURNING id;
        `;

        return { query, values };
      },
    });
  }
}
