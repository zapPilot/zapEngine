import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupabaseFetcher } from '../../../../src/modules/user-service/supabaseFetcher.js';
import { logger } from '../../../../src/utils/logger.js';

const { mockClient, mockGetDbClient } = vi.hoisted(() => {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
  };

  return {
    mockClient,
    mockGetDbClient: vi.fn().mockResolvedValue(mockClient),
  };
});

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../../../src/config/database.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/config/database.js')>();
  return {
    ...actual,
    createDbPool: vi.fn(),
    getDbPool: vi.fn(),
    getDbClient: mockGetDbClient,
    testDatabaseConnection: vi.fn().mockResolvedValue(true),
    closeDbPool: vi.fn(),
  };
});

describe('SupabaseFetcher', () => {
  let fetcher: SupabaseFetcher;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDbClient.mockResolvedValue(mockClient);
    fetcher = new SupabaseFetcher();
  });

  it('tracks request stats', () => {
    expect(fetcher.getRequestStats()).toEqual({
      requestCount: 0,
      lastRequestTime: 0,
    });
  });

  describe('batchUpdatePortfolioTimestamps', () => {
    it('returns early for empty wallet lists', async () => {
      await fetcher.batchUpdatePortfolioTimestamps([]);

      expect(logger.debug).toHaveBeenCalledWith(
        'No wallets to update timestamps for',
      );
      expect(mockGetDbClient).not.toHaveBeenCalled();
    });

    it('updates timestamps with case-insensitive SQL and logs the row count', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 5 });

      await fetcher.batchUpdatePortfolioTimestamps(['0xABC', '0xdef']);

      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE user_crypto_wallets SET last_portfolio_update_at = NOW() WHERE LOWER(wallet) = ANY($1)',
        [['0xABC', '0xdef']],
      );
      expect(logger.info).toHaveBeenCalledWith('Portfolio timestamps updated', {
        walletsRequested: 2,
        rowsUpdated: 5,
      });
    });

    it('falls back to zero when rowCount is undefined', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: undefined });

      await fetcher.batchUpdatePortfolioTimestamps(['0xabc']);

      expect(logger.info).toHaveBeenCalledWith('Portfolio timestamps updated', {
        walletsRequested: 1,
        rowsUpdated: 0,
      });
    });

    it('logs failures without throwing', async () => {
      vi.spyOn(
        fetcher as unknown as {
          withDatabaseClient: (callback: unknown) => Promise<never>;
        },
        'withDatabaseClient',
      ).mockRejectedValueOnce(new Error('db error'));

      await expect(
        fetcher.batchUpdatePortfolioTimestamps(['0xabc']),
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to update portfolio timestamps',
        {
          error: new Error('db error'),
          walletCount: 1,
        },
      );
    });
  });

  describe('healthCheck', () => {
    it('returns healthy when ping and function lookup succeed', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ ok: 1 }] })
        .mockResolvedValueOnce({ rows: [{ exists: true }] });

      await expect(fetcher.healthCheck()).resolves.toEqual({
        status: 'healthy',
      });
    });

    it('probes for the function the fetcher actually depends on', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ ok: 1 }] })
        .mockResolvedValueOnce({ rows: [{ exists: true }] });

      await fetcher.healthCheck();

      expect(mockClient.query).toHaveBeenLastCalledWith(
        "select exists (select 1 from pg_proc where proname = 'get_user_service_states') as exists",
      );
    });

    it('returns unhealthy when ping fails', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ ok: 0 }] })
        .mockResolvedValueOnce({ rows: [{ exists: true }] });

      await expect(fetcher.healthCheck()).resolves.toEqual({
        status: 'unhealthy',
        details: 'DB ping failed',
      });
    });

    it('returns unhealthy when the function is missing', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ ok: 1 }] })
        .mockResolvedValueOnce({ rows: [{ exists: false }] });

      await expect(fetcher.healthCheck()).resolves.toEqual({
        status: 'unhealthy',
        details: 'Function get_user_service_states not found',
      });
    });

    it('returns unhealthy when the health check throws unexpectedly', async () => {
      vi.spyOn(
        fetcher as unknown as {
          withDatabaseClient: (callback: unknown) => Promise<never>;
        },
        'withDatabaseClient',
      ).mockRejectedValueOnce(new Error('health fail'));

      await expect(fetcher.healthCheck()).resolves.toEqual({
        status: 'unhealthy',
        details: 'health fail',
      });
    });
  });
});
