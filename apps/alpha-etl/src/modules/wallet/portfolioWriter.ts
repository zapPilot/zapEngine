import type { PoolClient } from 'pg';

import { getTableName } from '../../config/database.js';
import {
  BaseWriter,
  createEmptyWriteResult,
  type WriteResult,
} from '../../core/database/baseWriter.js';
import { buildPortfolioInsertValues } from '../../core/database/columnDefinitions.js';
import type {
  DailyPortfolioPositionInsert,
  PortfolioItemSnapshotInsert,
  PortfolioSnapshotSource,
} from '../../types/database.js';
import { formatDateToYYYYMMDD } from '../../utils/dateUtils.js';
import { logger } from '../../utils/logger.js';
import {
  recordReplacementResult,
  replaceRowsInTransaction,
} from './dailyReplacement.js';

// Writes analytics.daily_portfolio_positions directly: the affected
// (wallet, UTC day) slices are deleted and re-inserted in one transaction,
// so a retried or repeated job always converges to the latest batch.
export class PortfolioItemWriter extends BaseWriter<PortfolioItemSnapshotInsert> {
  protected override batchSize = 100;

  async writeSnapshots(
    records: PortfolioItemSnapshotInsert[],
    source: PortfolioSnapshotSource,
    successfulWallets: string[] = [],
  ): Promise<WriteResult> {
    const result = createEmptyWriteResult();
    const validRecords = this.filterValidRecords(records, result);
    const positions = validRecords.map((record) =>
      toDailyPosition(record, source),
    );
    const replaceKeys = collectReplaceKeys(
      positions,
      source,
      successfulWallets,
    );

    if (replaceKeys.length === 0) {
      return result;
    }

    return recordReplacementResult(
      result,
      replaceKeys.length,
      'Daily portfolio positions replaced',
      () =>
        this.withDatabaseClient((client) =>
          this.replacePositions(client, positions, replaceKeys),
        ),
    );
  }

  private async replacePositions(
    client: PoolClient,
    positions: DailyPortfolioPositionInsert[],
    replaceKeys: [string, string, PortfolioSnapshotSource][],
  ): Promise<number> {
    const table = getTableName('DAILY_PORTFOLIO_POSITIONS');
    const keyPlaceholders = replaceKeys
      .map(
        (_, index) =>
          `($${index * 3 + 1}, $${index * 3 + 2}::date, $${index * 3 + 3})`,
      )
      .join(', ');

    return replaceRowsInTransaction({
      client,
      table,
      deleteSql: `DELETE FROM ${table} WHERE (wallet, snapshot_date, source) IN (${keyPlaceholders})`,
      deleteValues: replaceKeys.flat(),
      rows: positions,
      batchSize: this.batchSize,
      buildInsertValues: buildPortfolioInsertValues,
    });
  }

  private filterValidRecords(
    batch: PortfolioItemSnapshotInsert[],
    result: WriteResult,
  ): PortfolioItemSnapshotInsert[] {
    const validRecords: PortfolioItemSnapshotInsert[] = [];

    for (const record of batch) {
      const candidate = record as Partial<PortfolioItemSnapshotInsert>;
      const hasRequired = Boolean(
        candidate.wallet && candidate.id_raw && candidate.snapshot_at,
      );
      if (!hasRequired) {
        const message = `Invalid portfolio snapshot encountered for wallet ${candidate.wallet ?? 'unknown'} (${candidate.id_raw ?? 'missing id'})`;
        logger.warn(message);
        result.errors.push(message);
        continue;
      }

      validRecords.push(record);
    }

    return validRecords;
  }
}

function toDailyPosition(
  record: PortfolioItemSnapshotInsert,
  source: PortfolioSnapshotSource,
): DailyPortfolioPositionInsert {
  return {
    ...record,
    wallet: record.wallet.toLowerCase(),
    source,
    snapshot_date: formatDateToYYYYMMDD(new Date(record.snapshot_at)),
  };
}

function collectReplaceKeys(
  positions: DailyPortfolioPositionInsert[],
  source: PortfolioSnapshotSource,
  successfulWallets: string[],
): [string, string, PortfolioSnapshotSource][] {
  const keys = new Map<string, [string, string, PortfolioSnapshotSource]>();
  const walletsWithPositions = new Set<string>();
  for (const position of positions) {
    walletsWithPositions.add(position.wallet);
    keys.set(`${position.wallet}|${position.snapshot_date}|${source}`, [
      position.wallet,
      position.snapshot_date,
      source,
    ]);
  }
  const snapshotDate = formatDateToYYYYMMDD(new Date());
  for (const wallet of successfulWallets) {
    const normalizedWallet = wallet.toLowerCase();
    if (walletsWithPositions.has(normalizedWallet)) {
      continue;
    }
    keys.set(`${normalizedWallet}|${snapshotDate}|${source}`, [
      normalizedWallet,
      snapshotDate,
      source,
    ]);
  }
  return [...keys.values()];
}
