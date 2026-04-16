/**
 * Token Pair Ratio DMA Writer
 *
 * Handles writing pair-ratio DMA snapshots to the database.
 */

import { BaseWriter, type WriteResult } from '../../core/database/baseWriter.js';
import { buildTokenPairRatioDmaInsertValues } from '../../core/database/columnDefinitions.js';
import { getTableName } from '../../config/database.js';
import type { TokenPairRatioDmaSnapshotInsert } from '../../types/database.js';
import { logger } from '../../utils/logger.js';

export class TokenPairRatioDmaWriter extends BaseWriter<TokenPairRatioDmaSnapshotInsert> {
  async writeRatioDmaSnapshots(
    snapshots: TokenPairRatioDmaSnapshotInsert[]
  ): Promise<WriteResult> {
    logger.debug('Starting pair ratio DMA snapshots write', {
      snapshotCount: snapshots.length
    });

    return this.processBatches(
      snapshots,
      this.writeBatch.bind(this),
      'Pair ratio DMA snapshots'
    );
  }

  private async writeBatch(
    batch: TokenPairRatioDmaSnapshotInsert[],
    batchNumber: number
  ): Promise<WriteResult> {
    return this.executeBatchWrite({
      batchNumber,
      logContext: 'Pair ratio DMA snapshots',
      recordCount: batch.length,
      buildQuery: () => {
        const { columns, placeholders, values } = buildTokenPairRatioDmaInsertValues(batch);

        const query = `
          INSERT INTO ${getTableName('TOKEN_PAIR_RATIO_DMA_SNAPSHOTS')} (${columns.join(', ')})
          VALUES ${placeholders}
          ON CONFLICT (source, base_token_symbol, quote_token_symbol, snapshot_date)
          DO UPDATE SET
            ratio_value = EXCLUDED.ratio_value,
            dma_200 = EXCLUDED.dma_200,
            ratio_vs_dma_ratio = EXCLUDED.ratio_vs_dma_ratio,
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
