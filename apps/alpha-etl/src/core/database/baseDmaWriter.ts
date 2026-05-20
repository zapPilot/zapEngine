/**
 * Base DMA Writer
 *
 * Shared upsert logic for 200-day moving average snapshot tables.
 * Token-price and stock-price DMA writers differ only in table name,
 * conflict identifier column, source literal, and the insert-values builder.
 */

import { getTableName, type TableName } from '../../config/database.js';
import {
  type LatestDmaSnapshot,
  type LatestDmaSnapshotRow,
  mapLatestDmaSnapshotRow,
} from '../../modules/core/dmaSnapshot.js';
import { toErrorMessage } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { BaseWriter, type WriteResult } from './baseWriter.js';

export interface DmaInsertValues {
  columns: readonly string[];
  placeholders: string;
  values: unknown[];
}

export interface DmaWriterConfig<T> {
  /** Logical table key resolved via getTableName(). */
  tableKey: TableName;
  /** Identifier column used in the ON CONFLICT key (e.g. 'token_symbol' | 'symbol'). */
  conflictColumn: string;
  /** Source literal stored in the snapshots (e.g. 'coingecko' | 'yahoo-finance'). */
  sourceLiteral: string;
  /** Human label used in log/batch context (e.g. 'DMA snapshots'). */
  logLabel: string;
  buildInsertValues: (batch: T[]) => DmaInsertValues;
}

export abstract class BaseDmaWriter<T> extends BaseWriter<T> {
  protected abstract readonly dmaConfig: DmaWriterConfig<T>;

  async writeDmaSnapshots(snapshots: T[]): Promise<WriteResult> {
    logger.debug(`Starting ${this.dmaConfig.logLabel} write`, {
      snapshotCount: snapshots.length,
    });

    return this.processBatches(
      snapshots,
      this.writeBatch.bind(this),
      this.dmaConfig.logLabel,
    );
  }

  async getLatestDmaSnapshot(
    entity: string,
  ): Promise<LatestDmaSnapshot | null> {
    const { tableKey, conflictColumn, sourceLiteral, logLabel } =
      this.dmaConfig;

    const query = `
      SELECT snapshot_date, price_usd, dma_200, is_above_dma
      FROM ${getTableName(tableKey)}
      WHERE source = $1
        AND ${conflictColumn} = $2
      ORDER BY snapshot_date DESC
      LIMIT 1
    `;

    try {
      const result = await this.withDatabaseClient((client) =>
        client.query(query, [sourceLiteral, entity]),
      );

      if (result.rows.length === 0) {
        return null;
      }

      return mapLatestDmaSnapshotRow(result.rows[0] as LatestDmaSnapshotRow);
    } catch (error) {
      logger.error(`Failed to get latest ${logLabel}`, {
        entity,
        error: toErrorMessage(error),
      });
      return null;
    }
  }

  private async writeBatch(
    batch: T[],
    batchNumber: number,
  ): Promise<WriteResult> {
    const { tableKey, conflictColumn, logLabel, buildInsertValues } =
      this.dmaConfig;

    return this.executeBatchWrite({
      batchNumber,
      logContext: logLabel,
      recordCount: batch.length,
      buildQuery: () => {
        const { columns, placeholders, values } = buildInsertValues(batch);

        const query = `
          INSERT INTO ${getTableName(tableKey)} (${columns.join(', ')})
          VALUES ${placeholders}
          ON CONFLICT (source, ${conflictColumn}, snapshot_date)
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
