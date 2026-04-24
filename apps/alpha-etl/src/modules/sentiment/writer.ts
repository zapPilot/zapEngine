/**
 * Sentiment Writer
 *
 * Handles database writes for sentiment snapshots
 *
 * Target: sentiment_snapshots table
 */

import { getTableName } from '../../config/database.js';
import {
  BaseWriter,
  type WriteResult,
} from '../../core/database/baseWriter.js';
import { buildSentimentInsertValues } from '../../core/database/columnDefinitions.js';
import type { SentimentSnapshotInsert } from '../../types/database.js';
import { logger } from '../../utils/logger.js';

/**
 * Sentiment Writer
 *
 * Handles database writes for sentiment snapshots
 */
export class SentimentWriter extends BaseWriter<SentimentSnapshotInsert> {
  async writeSentimentSnapshots(
    snapshots: SentimentSnapshotInsert[],
    source: string,
  ): Promise<WriteResult> {
    logger.debug('Starting sentiment snapshots write', {
      source,
      snapshotCount: snapshots.length,
    });

    return this.processBatches(
      snapshots,
      this.writeBatch.bind(this),
      'sentiment snapshots',
    );
  }

  private async writeBatch(
    batch: SentimentSnapshotInsert[],
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
      logger.warn('No valid records in batch', { batchNumber });
      return result;
    }

    const batchResult = await this.executeBatchWrite({
      batchNumber,
      logContext: 'sentiment snapshots',
      recordCount: validRecords.length,
      buildQuery: () => {
        const { columns, placeholders, values } =
          buildSentimentInsertValues(validRecords);
        const query = `
          INSERT INTO ${getTableName('SENTIMENT_SNAPSHOTS')} (${columns.join(', ')})
          VALUES ${placeholders}
          ON CONFLICT (source, snapshot_time)
          DO UPDATE SET
            sentiment_value = EXCLUDED.sentiment_value,
            classification = EXCLUDED.classification,
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
    batch: SentimentSnapshotInsert[],
    result: WriteResult,
  ): SentimentSnapshotInsert[] {
    const validRecords: SentimentSnapshotInsert[] = [];

    for (const record of batch) {
      const candidate = record as Partial<
        Omit<SentimentSnapshotInsert, 'sentiment_value'>
      > & {
        sentiment_value?: number | null;
      };
      if (
        !candidate.source ||
        !candidate.classification ||
        candidate.sentiment_value == null
      ) {
        result.errors.push(
          `Invalid record: missing required fields (source: ${record.source}, ` +
            `classification: ${record.classification}, ` +
            `sentiment_value: ${record.sentiment_value})`,
        );
        continue;
      }

      validRecords.push(record);
    }

    return validRecords;
  }
}
