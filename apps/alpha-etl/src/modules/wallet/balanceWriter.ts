import type { PoolClient } from 'pg';

import { getTableName } from '../../config/database.js';
import {
  BaseWriter,
  createEmptyWriteResult,
  type WriteResult,
} from '../../core/database/baseWriter.js';
import { buildInsertValues } from '../../core/database/columnDefinitions.js';
import type {
  DailyWalletTokenInsert,
  WalletBalanceSnapshotInsert,
} from '../../types/database.js';
import {
  recordReplacementResult,
  replaceRowsInTransaction,
} from './dailyReplacement.js';

export class WalletBalanceWriter extends BaseWriter<WalletBalanceSnapshotInsert> {
  async writeWalletBalanceSnapshots(
    snapshots: WalletBalanceSnapshotInsert[],
    successfulWallets: string[] = [],
  ): Promise<WriteResult> {
    const result = createEmptyWriteResult();
    const tokens = toDailyWalletTokens(snapshots);
    const replaceKeys = collectReplaceKeys(tokens, successfulWallets);

    if (replaceKeys.length === 0) {
      return result;
    }

    return recordReplacementResult(
      result,
      replaceKeys.length,
      'Daily wallet tokens replaced',
      () =>
        this.withDatabaseClient((client) =>
          this.replaceTokens(client, tokens, replaceKeys),
        ),
    );
  }

  private async replaceTokens(
    client: PoolClient,
    tokens: DailyWalletTokenInsert[],
    replaceKeys: [string, string][],
  ): Promise<number> {
    const table = getTableName('DAILY_WALLET_TOKENS');
    const keyPlaceholders = replaceKeys
      .map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2}::date)`)
      .join(', ');

    return replaceRowsInTransaction({
      client,
      table,
      deleteSql: `DELETE FROM ${table} WHERE (user_wallet_address, snapshot_date) IN (${keyPlaceholders})`,
      deleteValues: replaceKeys.flat(),
      rows: tokens,
      batchSize: this.batchSize,
      buildInsertValues,
    });
  }
}

function toDailyWalletTokens(
  snapshots: WalletBalanceSnapshotInsert[],
): DailyWalletTokenInsert[] {
  const tokens = new Map<string, DailyWalletTokenInsert>();

  for (const snapshot of snapshots) {
    if (
      snapshot.is_wallet !== true ||
      !snapshot.user_wallet_address ||
      !snapshot.token_address ||
      !snapshot.chain
    ) {
      continue;
    }

    const token: DailyWalletTokenInsert = {
      user_wallet_address: snapshot.user_wallet_address.toLowerCase(),
      token_address: snapshot.token_address,
      chain: snapshot.chain,
      symbol: snapshot.symbol ?? null,
      amount: snapshot.amount ?? null,
      price: snapshot.price ?? null,
      snapshot_date: toUtcDateString(
        snapshot.inserted_at ?? snapshot.snapshot_time ?? new Date(),
      ),
    };
    tokens.set(
      `${token.user_wallet_address}|${token.snapshot_date}|${token.chain}|${token.token_address}`,
      token,
    );
  }

  return [...tokens.values()];
}

function toUtcDateString(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return date.toISOString().slice(0, 10);
}

function collectReplaceKeys(
  tokens: DailyWalletTokenInsert[],
  successfulWallets: string[],
): [string, string][] {
  const keys = new Map<string, [string, string]>();
  const walletsWithTokens = new Set<string>();
  for (const token of tokens) {
    walletsWithTokens.add(token.user_wallet_address);
    keys.set(`${token.user_wallet_address}|${token.snapshot_date}`, [
      token.user_wallet_address,
      token.snapshot_date,
    ]);
  }
  const snapshotDate = toUtcDateString(new Date());
  for (const wallet of successfulWallets) {
    const normalizedWallet = wallet.toLowerCase();
    if (walletsWithTokens.has(normalizedWallet)) {
      continue;
    }
    keys.set(`${normalizedWallet}|${snapshotDate}`, [
      normalizedWallet,
      snapshotDate,
    ]);
  }
  return [...keys.values()];
}
