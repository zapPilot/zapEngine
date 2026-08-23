import { describe, expect, it } from 'vitest';

import {
  buildInsertValues,
  DAILY_WALLET_TOKEN_COLUMNS,
  type DailyWalletTokenColumn,
} from '../../../../src/core/database/columnDefinitions.js';
import type { DailyWalletTokenInsert } from '../../../../src/types/database.js';

describe('daily wallet token columns', () => {
  const token: DailyWalletTokenInsert = {
    user_wallet_address: '0xabc',
    token_address: '0xtoken',
    chain: 'eth',
    symbol: 'ETH',
    amount: 2,
    price: 3000,
    snapshot_date: '2026-08-23',
  };

  it('contains only the canonical reader-facing columns', () => {
    expect(DAILY_WALLET_TOKEN_COLUMNS).toEqual([
      'user_wallet_address',
      'token_address',
      'chain',
      'symbol',
      'amount',
      'price',
      'snapshot_date',
    ]);
    const typedColumn: DailyWalletTokenColumn = 'snapshot_date';
    expect(typedColumn).toBe('snapshot_date');
  });

  it('builds positional values and preserves nulls', () => {
    const result = buildInsertValues([
      token,
      { ...token, token_address: '0xother', symbol: null },
    ]);

    expect(result.columns).toBe(DAILY_WALLET_TOKEN_COLUMNS);
    expect(result.placeholders).toBe(
      '($1, $2, $3, $4, $5, $6, $7), ($8, $9, $10, $11, $12, $13, $14)',
    );
    expect(result.values).toHaveLength(14);
    expect(result.values[10]).toBeNull();
  });
});
