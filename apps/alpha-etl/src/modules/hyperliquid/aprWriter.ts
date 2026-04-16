import { BaseWriter, type WriteResult } from '../../core/database/baseWriter.js';
import { getTableName } from '../../config/database.js';
import type { HyperliquidVaultAprSnapshotInsert } from '../../types/database.js';
import { buildHyperliquidInsertValues } from '../../core/database/columnDefinitions.js';

export class HyperliquidVaultAprWriter extends BaseWriter<HyperliquidVaultAprSnapshotInsert> {
  protected batchSize = 100;

  async writeSnapshots(snapshots: HyperliquidVaultAprSnapshotInsert[]): Promise<WriteResult> {
    return this.processBatches(
      snapshots,
      this.writeBatch.bind(this),
      'Hyperliquid vault APR snapshots'
    );
  }

  private async writeBatch(batch: HyperliquidVaultAprSnapshotInsert[], batchNumber: number): Promise<WriteResult> {
    return this.executeBatchWrite({
      batchNumber,
      logContext: 'Hyperliquid APR',
      recordCount: batch.length,
      buildQuery: () => {
        const { columns, placeholders, values } = buildHyperliquidInsertValues(batch);
        const updateColumns = columns.filter((column) => column !== 'snapshot_time');
        const assignments = updateColumns
          .filter((column) => column !== 'source')
          .map((column) => `${column} = EXCLUDED.${column}`)
          .join(', ');
        const query = `
          INSERT INTO ${getTableName('HYPERLIQUID_VAULT_APR_SNAPSHOTS')} (${columns.join(', ')})
          VALUES ${placeholders}
          ON CONFLICT (vault_address, snapshot_time) DO UPDATE SET
            ${assignments}
          RETURNING 1;
        `;
        return { query, values };
      },
    });
  }
}
