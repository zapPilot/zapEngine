import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDbClient } from '../../../../src/config/database.js';
import { WalletBalanceWriter } from '../../../../src/modules/wallet/balanceWriter.js';
import type { WalletBalanceSnapshotInsert } from '../../../../src/types/database.js';

vi.mock('../../../../src/config/database.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/config/database.js')>();
  return { ...actual, getDbClient: vi.fn() };
});

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

const token = (
  overrides: Partial<WalletBalanceSnapshotInsert> = {},
): WalletBalanceSnapshotInsert => ({
  user_wallet_address: '0xABC',
  token_address: '0xtoken',
  chain: 'eth',
  symbol: 'ETH',
  amount: 2,
  price: 3000,
  is_wallet: true,
  inserted_at: '2026-08-23',
  ...overrides,
});

describe('WalletBalanceWriter', () => {
  const query = vi.fn();
  const release = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue({ rowCount: 0, rows: [] });
    vi.mocked(getDbClient).mockResolvedValue({ query, release } as never);
  });

  it('filters protocol tokens, deduplicates token keys, and replaces wallet/day', async () => {
    query.mockResolvedValue({ rowCount: 2 });

    const result = await new WalletBalanceWriter().writeWalletBalanceSnapshots([
      token({ amount: 1 }),
      token({ amount: 2 }),
      token({ token_address: '0xother' }),
      token({ token_address: '0xprotocol', is_wallet: false }),
      token({ token_address: null }),
    ]);

    expect(result.recordsInserted).toBe(2);
    expect(query.mock.calls[0]?.[0]).toBe('BEGIN');
    expect(query.mock.calls[1]?.[0]).toContain(
      'DELETE FROM analytics.daily_wallet_tokens',
    );
    expect(query.mock.calls[1]?.[1]).toEqual(['0xabc', '2026-08-23']);
    expect(query.mock.calls[2]?.[0]).toContain(
      'INSERT INTO analytics.daily_wallet_tokens',
    );
    expect(query.mock.calls[2]?.[0]).not.toContain('ON CONFLICT');
    expect(query.mock.calls[2]?.[1]).toEqual([
      '0xabc',
      '0xtoken',
      'eth',
      'ETH',
      2,
      3000,
      '2026-08-23',
      '0xabc',
      '0xother',
      'eth',
      'ETH',
      2,
      3000,
      '2026-08-23',
    ]);
    expect(query.mock.calls[3]?.[0]).toBe('COMMIT');
  });

  it('falls back to snapshot_time and keeps the UTC day for late timestamps', async () => {
    query.mockResolvedValue({ rowCount: 1 });

    await new WalletBalanceWriter().writeWalletBalanceSnapshots([
      token({
        inserted_at: null,
        snapshot_time: '2026-08-23T23:59:59.999Z',
      }),
    ]);

    expect(query.mock.calls[1]?.[1]).toEqual(['0xabc', '2026-08-23']);
  });

  it('does not connect when no idle wallet tokens are present', async () => {
    const result = await new WalletBalanceWriter().writeWalletBalanceSnapshots([
      token({ is_wallet: false }),
    ]);

    expect(result.recordsInserted).toBe(0);
    expect(getDbClient).not.toHaveBeenCalled();
  });

  it('deletes a successful empty wallet/day slice', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T12:00:00.000Z'));

    const result = await new WalletBalanceWriter().writeWalletBalanceSnapshots(
      [],
      ['0xABC'],
    );

    expect(result.recordsInserted).toBe(0);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      expect.stringContaining('DELETE FROM analytics.daily_wallet_tokens'),
      'COMMIT',
    ]);
    expect(query.mock.calls[1]?.[1]).toEqual(['0xabc', '2026-08-23']);
    vi.useRealTimers();
  });

  it('clears successful empty wallets in the same replacement as wallets with tokens', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T12:00:00.000Z'));
    query.mockResolvedValue({ rowCount: 1 });

    const result = await new WalletBalanceWriter().writeWalletBalanceSnapshots(
      [token()],
      ['0xABC', '0xEMPTY'],
    );

    expect(result.recordsInserted).toBe(1);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      expect.stringContaining('DELETE FROM analytics.daily_wallet_tokens'),
      expect.stringContaining('INSERT INTO analytics.daily_wallet_tokens'),
      'COMMIT',
    ]);
    expect(query.mock.calls[1]?.[1]).toEqual([
      '0xabc',
      '2026-08-23',
      '0xempty',
      '2026-08-23',
    ]);
    expect(query.mock.calls[2]?.[1]).toEqual([
      '0xabc',
      '0xtoken',
      'eth',
      'ETH',
      2,
      3000,
      '2026-08-23',
    ]);
    vi.useRealTimers();
  });

  it('rolls back the delete when the replacement insert fails', async () => {
    query
      .mockResolvedValueOnce({ rowCount: null })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockRejectedValueOnce(new Error('insert failed'))
      .mockResolvedValueOnce({ rowCount: null });

    const result = await new WalletBalanceWriter().writeWalletBalanceSnapshots([
      token(),
    ]);

    expect(result.success).toBe(false);
    expect(result.errors).toContain('insert failed');
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      expect.stringContaining('DELETE FROM analytics.daily_wallet_tokens'),
      expect.stringContaining('INSERT INTO analytics.daily_wallet_tokens'),
      'ROLLBACK',
    ]);
    expect(query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });

  it('rolls back and reports database errors', async () => {
    query
      .mockResolvedValueOnce({ rowCount: null })
      .mockRejectedValueOnce(new Error('delete failed'))
      .mockResolvedValueOnce({ rowCount: null });

    const result = await new WalletBalanceWriter().writeWalletBalanceSnapshots([
      token(),
    ]);

    expect(result.success).toBe(false);
    expect(result.errors).toContain('delete failed');
    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalledOnce();
  });
});
