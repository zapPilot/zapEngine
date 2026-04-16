import { BaseWriter, type WriteResult } from '../../core/database/baseWriter.js';
import { logger } from '../../utils/logger.js';
import { getTableName } from '../../config/database.js';
import type { PortfolioItemSnapshotInsert } from '../../types/database.js';
import { buildPortfolioInsertValues } from '../../core/database/columnDefinitions.js';

export class PortfolioItemWriter extends BaseWriter<PortfolioItemSnapshotInsert> {
  protected batchSize = 100;

  async writeSnapshots(records: PortfolioItemSnapshotInsert[]): Promise<WriteResult> {
    return this.processBatches(
      records,
      this.writeBatch.bind(this),
      'DeBank portfolio snapshots'
    );
  }

  private async writeBatch(batch: PortfolioItemSnapshotInsert[], batchNumber: number): Promise<WriteResult> {
    const result: WriteResult = { success: true, recordsInserted: 0, errors: [], duplicatesSkipped: 0 };
    const validRecords = this.filterValidRecords(batch, result);

    if (validRecords.length === 0) {
      return result;
    }

    const batchResult = await this.executeBatchWrite({
      batchNumber,
      logContext: 'DeBank portfolio',
      recordCount: validRecords.length,
      buildQuery: () => {
        const { columns, placeholders, values } = buildPortfolioInsertValues(validRecords);
        const query = `
          INSERT INTO ${getTableName('PORTFOLIO_ITEM_SNAPSHOTS')} (${columns.join(', ')})
          VALUES ${placeholders}
          RETURNING 1;
        `;
        return { query, values };
      },
    });

    this.mergeBatchResult(result, batchResult);
    return result;
  }

  private filterValidRecords(
    batch: PortfolioItemSnapshotInsert[],
    result: WriteResult
  ): PortfolioItemSnapshotInsert[] {
    const validRecords: PortfolioItemSnapshotInsert[] = [];

    for (const record of batch) {
      const hasRequired = Boolean(record.wallet && record.id_raw);
      if (!hasRequired) {
        const message = `Invalid portfolio snapshot encountered for wallet ${record.wallet ?? 'unknown'} (${record.id_raw ?? 'missing id'})`;
        logger.warn(message);
        result.errors.push(message);
        continue;
      }

      validRecords.push(record);
    }

    return validRecords;
  }
}
