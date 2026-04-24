import { getTableName } from '../../config/database.js';
import {
  BaseWriter,
  type WriteResult,
} from '../../core/database/baseWriter.js';
import { buildPoolInsertValues } from '../../core/database/columnDefinitions.js';
import type { PoolAprSnapshotInsert } from '../../types/database.js';
import { logger } from '../../utils/logger.js';

export class PoolWriter extends BaseWriter<PoolAprSnapshotInsert> {
  async writePoolSnapshots(
    snapshots: PoolAprSnapshotInsert[],
    source: string,
  ): Promise<WriteResult> {
    logger.debug('Writing pool snapshots', {
      source,
      recordCount: snapshots.length,
    });

    return this.processBatches(
      snapshots,
      this.writeBatch.bind(this),
      'pool snapshots',
    );
  }

  private async writeBatch(
    batch: PoolAprSnapshotInsert[],
    batchNumber: number,
  ): Promise<WriteResult> {
    const result: WriteResult = {
      success: true,
      recordsInserted: 0,
      errors: [],
      duplicatesSkipped: 0,
    };
    const validRecords = this.filterValidRecords(batch, result);

    if (validRecords.length === 0) {
      return result;
    }

    const batchResult = await this.executeBatchWrite({
      batchNumber,
      logContext: 'pool snapshots',
      recordCount: validRecords.length,
      buildQuery: () => {
        const { columns, placeholders, values } =
          buildPoolInsertValues(validRecords);
        const query = `
          INSERT INTO ${getTableName('POOL_APR_SNAPSHOTS')} (${columns.join(', ')})
          VALUES ${placeholders}
          ON CONFLICT (pool_address, protocol_address, chain, source, snapshot_time)
          DO UPDATE SET
            symbol = EXCLUDED.symbol,
            symbols = EXCLUDED.symbols,
            underlying_tokens = EXCLUDED.underlying_tokens,
            tvl_usd = EXCLUDED.tvl_usd,
            apr = EXCLUDED.apr,
            apr_base = EXCLUDED.apr_base,
            apr_reward = EXCLUDED.apr_reward,
            volume_usd_1d = EXCLUDED.volume_usd_1d,
            exposure = EXCLUDED.exposure,
            reward_tokens = EXCLUDED.reward_tokens,
            pool_meta = EXCLUDED.pool_meta,
            raw_data = EXCLUDED.raw_data
          RETURNING id;
        `;
        return { query, values };
      },
    });

    this.mergeBatchResult(result, batchResult);
    return result;
  }

  private filterValidRecords(
    batch: PoolAprSnapshotInsert[],
    result: WriteResult,
  ): PoolAprSnapshotInsert[] {
    const validRecords: PoolAprSnapshotInsert[] = [];

    for (const record of batch) {
      const candidate = record as Partial<
        Omit<PoolAprSnapshotInsert, 'apr'>
      > & {
        apr?: number | null;
      };
      if (!candidate.source || !candidate.symbol || candidate.apr == null) {
        result.errors.push(
          `Invalid record: missing required fields (source: ${record.source}, symbol: ${record.symbol}, apr: ${record.apr})`,
        );
        continue;
      }

      validRecords.push(record);
    }

    return validRecords;
  }
}
