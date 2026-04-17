import {
  BaseWriter,
  type WriteResult,
} from "../../core/database/baseWriter.js";
import { getTableName } from "../../config/database.js";
import type { WalletBalanceSnapshotInsert } from "../../types/database.js";
import {
  WALLET_BALANCE_COLUMNS,
  buildInsertValues,
} from "../../core/database/columnDefinitions.js";

export class WalletBalanceWriter extends BaseWriter<WalletBalanceSnapshotInsert> {
  async writeWalletBalanceSnapshots(
    snapshots: WalletBalanceSnapshotInsert[],
  ): Promise<WriteResult> {
    return this.processBatches(
      snapshots,
      this.writeBatch.bind(this),
      "wallet balance snapshots",
    );
  }

  private async writeBatch(
    batch: WalletBalanceSnapshotInsert[],
    batchNumber: number,
  ): Promise<WriteResult> {
    return this.executeBatchWrite({
      batchNumber,
      logContext: "wallet balance",
      recordCount: batch.length,
      buildQuery: () => {
        const { columns, placeholders, values } = buildInsertValues(
          batch,
          WALLET_BALANCE_COLUMNS,
        );
        const query = `
          INSERT INTO ${getTableName("WALLET_TOKEN_SNAPSHOTS")} (${columns.join(", ")})
          VALUES ${placeholders}
          ON CONFLICT (user_wallet_address, token_address, chain, inserted_at) DO NOTHING`;
        return { query, values };
      },
    });
  }
}
