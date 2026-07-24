import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDbClient } from '../../../src/config/database.js';
import {
  PortfolioRollupSynchronizer,
  portfolioRollupSynchronizer,
} from '../../../src/modules/core/portfolioRollupSync.js';

vi.mock('../../../src/config/database.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../src/config/database.js')>();
  return {
    ...actual,
    getDbClient: vi.fn(),
  };
});

vi.mock('../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../setup/mocks.js');
  return mockLogger();
});

const metricsRow = {
  portfolioKeysProcessed: '2',
  walletKeysProcessed: '3',
  usersProcessed: '1',
  portfolioRowsWritten: '5',
  walletRowsWritten: '8',
  trendRowsWritten: '13',
  remainingPortfolioKeys: '0',
  remainingWalletKeys: '0',
  remainingUsers: '0',
};

describe('PortfolioRollupSynchronizer', () => {
  let synchronizer: PortfolioRollupSynchronizer;
  let mockClient: {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [metricsRow] }),
      release: vi.fn(),
    };
    vi.mocked(getDbClient).mockResolvedValue(mockClient as never);
    synchronizer = new PortfolioRollupSynchronizer();
  });

  it('calls the incremental database processor and returns numeric metrics', async () => {
    const result = await synchronizer.synchronize('job-1');

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('private.process_portfolio_rollup_queue()'),
    );
    expect(mockClient.query).not.toHaveBeenCalledWith(
      expect.stringContaining('REFRESH MATERIALIZED VIEW'),
    );
    expect(result.metrics).toEqual({
      portfolioKeysProcessed: 2,
      walletKeysProcessed: 3,
      usersProcessed: 1,
      portfolioRowsWritten: 5,
      walletRowsWritten: 8,
      trendRowsWritten: 13,
      remainingPortfolioKeys: 0,
      remainingWalletKeys: 0,
      remainingUsers: 0,
    });
    expect(mockClient.release).toHaveBeenCalledOnce();
  });

  it('fails when the processor does not return its metrics row', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await expect(synchronizer.synchronize('job-2')).rejects.toThrow(
      'Portfolio rollup processor returned no metrics row',
    );
    expect(mockClient.release).toHaveBeenCalledOnce();
  });

  it('releases the database client when processing fails', async () => {
    mockClient.query.mockRejectedValue(new Error('processor failed'));

    await expect(synchronizer.synchronize('job-3')).rejects.toThrow(
      'processor failed',
    );
    expect(mockClient.release).toHaveBeenCalledOnce();
  });

  it('does not release a client that was never acquired', async () => {
    vi.mocked(getDbClient).mockRejectedValue('database unavailable');

    await expect(synchronizer.synchronize('job-4')).rejects.toBe(
      'database unavailable',
    );
    expect(mockClient.release).not.toHaveBeenCalled();
  });

  it('exports a singleton synchronizer', () => {
    expect(portfolioRollupSynchronizer).toBeInstanceOf(
      PortfolioRollupSynchronizer,
    );
  });
});
