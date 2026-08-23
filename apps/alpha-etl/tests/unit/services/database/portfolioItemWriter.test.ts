import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDbClient } from '../../../../src/config/database.js';
import { PortfolioItemWriter } from '../../../../src/modules/wallet/portfolioWriter.js';
import type { PortfolioItemSnapshotInsert } from '../../../../src/types/database.js';

vi.mock('../../../../src/config/database.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/config/database.js')>();
  return { ...actual, getDbClient: vi.fn() };
});

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

const position = (
  overrides: Partial<PortfolioItemSnapshotInsert> = {},
): PortfolioItemSnapshotInsert => ({
  wallet: '0xABC',
  chain: 'eth',
  name: 'Protocol',
  name_item: 'Position',
  id_raw: 'shared-protocol-id',
  asset_usd_value: 10,
  detail: {},
  snapshot_at: '2026-08-23T23:30:00.000Z',
  has_supported_portfolio: true,
  site_url: 'https://example.com',
  asset_dict: {},
  asset_token_list: [],
  detail_types: [],
  pool: {},
  proxy_detail: {},
  debt_usd_value: 0,
  net_usd_value: 10,
  update_at: 1,
  ...overrides,
});

describe('PortfolioItemWriter', () => {
  const query = vi.fn();
  const release = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue({ rowCount: 0, rows: [] });
    vi.mocked(getDbClient).mockResolvedValue({ query, release } as never);
  });

  it('replaces each wallet/day slice in one transaction', async () => {
    query
      .mockResolvedValueOnce({ rowCount: null })
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValueOnce({ rowCount: null });

    const result = await new PortfolioItemWriter().writeSnapshots(
      [position(), position({ name_item: 'Second position' })],
      'debank',
    );

    expect(result.recordsInserted).toBe(2);
    expect(query.mock.calls[0]?.[0]).toBe('BEGIN');
    expect(query.mock.calls[1]?.[0]).toContain(
      'DELETE FROM analytics.daily_portfolio_positions',
    );
    expect(query.mock.calls[1]?.[1]).toEqual(['0xabc', '2026-08-23', 'debank']);
    expect(query.mock.calls[2]?.[0]).toContain(
      'INSERT INTO analytics.daily_portfolio_positions',
    );
    expect(query.mock.calls[2]?.[0]).not.toContain('ON CONFLICT');
    expect(query.mock.calls[3]?.[0]).toBe('COMMIT');
  });

  it('keeps distinct positions that share id_raw', async () => {
    query.mockResolvedValue({ rowCount: 2 });

    await new PortfolioItemWriter().writeSnapshots(
      [position(), position({ name_item: 'Second position' })],
      'debank',
    );

    const insertValues = query.mock.calls[2]?.[1] as unknown[];
    expect(
      insertValues.filter((value) => value === 'shared-protocol-id'),
    ).toHaveLength(2);
  });

  it('returns validation errors without opening a connection', async () => {
    const result = await new PortfolioItemWriter().writeSnapshots(
      [position({ wallet: '' })],
      'debank',
    );

    expect(result.recordsInserted).toBe(0);
    expect(result.errors[0]).toContain('Invalid portfolio snapshot');
    expect(getDbClient).not.toHaveBeenCalled();
  });

  it('reports a failed transaction and releases the client', async () => {
    query
      .mockResolvedValueOnce({ rowCount: null })
      .mockRejectedValueOnce(new Error('delete failed'))
      .mockResolvedValueOnce({ rowCount: null });

    const result = await new PortfolioItemWriter().writeSnapshots(
      [position()],
      'debank',
    );

    expect(result.success).toBe(false);
    expect(result.errors).toContain('delete failed');
    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalledOnce();
  });

  it('keeps provider slices isolated for the same wallet/day', async () => {
    query.mockResolvedValue({ rowCount: 1 });

    await new PortfolioItemWriter().writeSnapshots(
      [position({ chain: 'hyperliquid' })],
      'hyperliquid',
    );

    expect(query.mock.calls[1]?.[0]).toContain(
      '(wallet, snapshot_date, source)',
    );
    expect(query.mock.calls[1]?.[1]).toEqual([
      '0xabc',
      '2026-08-23',
      'hyperliquid',
    ]);
  });

  it('deletes a successful empty provider slice', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T12:00:00.000Z'));

    const result = await new PortfolioItemWriter().writeSnapshots(
      [],
      'debank',
      ['0xABC'],
    );

    expect(result.recordsInserted).toBe(0);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      expect.stringContaining(
        'DELETE FROM analytics.daily_portfolio_positions',
      ),
      'COMMIT',
    ]);
    expect(query.mock.calls[1]?.[1]).toEqual(['0xabc', '2026-08-23', 'debank']);
    vi.useRealTimers();
  });
});
