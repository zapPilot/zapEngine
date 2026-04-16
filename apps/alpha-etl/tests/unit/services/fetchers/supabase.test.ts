import { describe, it, expect, beforeEach, vi } from 'vitest';
import { APIError } from '../../../../src/utils/errors.js';
import { SupabaseFetcher } from '../../../../src/modules/vip-users/supabaseFetcher.js';
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
  const actual = await importOriginal<typeof import('../../../../src/config/database.js')>();
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

  describe('fetchVipUsers', () => {
    it('returns normalized wallets on success', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          { user_id: 'u1', wallet: '0xABC' },
          { user_id: 'u2', wallet: '0xDEF' }
        ]
      });

      const result = await fetcher.fetchVipUsers();

      expect(mockClient.query).toHaveBeenCalledWith(
        'select user_id, wallet from public.get_users_wallets_by_plan($1)',
        ['vip']
      );
      expect(result).toEqual([
        { user_id: 'u1', wallet: '0xabc' },
        { user_id: 'u2', wallet: '0xdef' }
      ]);
      expect(logger.info).toHaveBeenCalledWith('VIP users fetched successfully', { userCount: 2 });
      expect(fetcher.getRequestStats().requestCount).toBe(1);
    });

    it('filters invalid rows and logs a warning', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          { user_id: 'u1', wallet: '0xABC' },
          { user_id: null, wallet: '0xDEF' },
          { user_id: 'u2', wallet: '' }
        ]
      });

      const result = await fetcher.fetchVipUsers();

      expect(result).toEqual([{ user_id: 'u1', wallet: '0xabc' }]);
      expect(logger.warn).toHaveBeenCalledWith('Some invalid user records filtered out', {
        total: 3,
        valid: 1,
        invalid: 2
      });
    });

    it('re-throws APIError instances without wrapping', async () => {
      const apiError = new APIError('db error', 500, 'db', 'SupabaseFetcher');
      vi.spyOn(fetcher as unknown as { withDatabaseClient: (callback: unknown) => Promise<never> }, 'withDatabaseClient')
        .mockRejectedValueOnce(apiError);

      await expect(fetcher.fetchVipUsers()).rejects.toBe(apiError);
    });

    it('wraps unexpected errors in APIError', async () => {
      vi.spyOn(fetcher as unknown as { withDatabaseClient: (callback: unknown) => Promise<never> }, 'withDatabaseClient')
        .mockRejectedValueOnce(new Error('boom'));

      await expect(fetcher.fetchVipUsers()).rejects.toThrow('DB fetch failed: boom');
      await expect(fetcher.fetchVipUsers()).rejects.toBeInstanceOf(APIError);
    });

    it('uses Unknown error for non-Error failures', async () => {
      vi.spyOn(fetcher as unknown as { withDatabaseClient: (callback: unknown) => Promise<never> }, 'withDatabaseClient')
        .mockRejectedValueOnce('String Error');

      await expect(fetcher.fetchVipUsers()).rejects.toThrow('DB fetch failed: Unknown error');
    });
  });

  describe('fetchVipUsersWithActivity', () => {
    it('normalizes, deduplicates, and summarizes activity rows', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            user_id: 'u1',
            wallet: '0xABC',
            last_activity_at: '2023-01-01',
            last_portfolio_update_at: '2023-01-02'
          },
          {
            user_id: 'u1',
            wallet: '0xabc',
            last_activity_at: '2023-01-01',
            last_portfolio_update_at: '2023-01-02'
          }
        ]
      });

      const result = await fetcher.fetchVipUsersWithActivity();

      expect(result).toEqual([
        {
          user_id: 'u1',
          wallet: '0xabc',
          last_activity_at: '2023-01-01',
          last_portfolio_update_at: '2023-01-02'
        }
      ]);
      expect(logger.warn).toHaveBeenCalledWith('Duplicate wallets detected after SQL query', {
        total: 2,
        unique: 1,
        duplicates: 1
      });
      expect(logger.info).toHaveBeenCalledWith('VIP users with activity fetched successfully', {
        userCount: 1,
        withActivity: 1,
        withPortfolioUpdate: 1
      });
    });

    it('filters invalid rows', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            user_id: 'u1',
            wallet: '0xABC',
            last_activity_at: '2023',
            last_portfolio_update_at: '2023'
          },
          {
            user_id: null,
            wallet: '0xDEF'
          }
        ]
      });

      const result = await fetcher.fetchVipUsersWithActivity();

      expect(result).toHaveLength(1);
      expect(result[0].wallet).toBe('0xabc');
      expect(logger.warn).toHaveBeenCalledWith('Some invalid user records filtered out', {
        total: 2,
        valid: 1,
        invalid: 1
      });
    });

    it('propagates APIError instances', async () => {
      const apiError = new APIError('db error', 500, 'db', 'SupabaseFetcher');
      vi.spyOn(fetcher as unknown as { withDatabaseClient: (callback: unknown) => Promise<never> }, 'withDatabaseClient')
        .mockRejectedValueOnce(apiError);

      await expect(fetcher.fetchVipUsersWithActivity()).rejects.toBe(apiError);
    });

    it('wraps generic and non-Error failures', async () => {
      const withDatabaseClientSpy = vi.spyOn(
        fetcher as unknown as { withDatabaseClient: (callback: unknown) => Promise<never> },
        'withDatabaseClient'
      );

      withDatabaseClientSpy.mockRejectedValueOnce(new Error('boom'));
      await expect(fetcher.fetchVipUsersWithActivity()).rejects.toThrow('DB fetch with activity failed: boom');

      withDatabaseClientSpy.mockRejectedValueOnce('String Error');
      await expect(fetcher.fetchVipUsersWithActivity()).rejects.toThrow('DB fetch with activity failed: Unknown error');
    });
  });

  describe('batchUpdatePortfolioTimestamps', () => {
    it('returns early for empty wallet lists', async () => {
      await fetcher.batchUpdatePortfolioTimestamps([]);

      expect(logger.debug).toHaveBeenCalledWith('No wallets to update timestamps for');
      expect(mockGetDbClient).not.toHaveBeenCalled();
    });

    it('updates timestamps with case-insensitive SQL and logs the row count', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 5 });

      await fetcher.batchUpdatePortfolioTimestamps(['0xABC', '0xdef']);

      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE user_crypto_wallets SET last_portfolio_update_at = NOW() WHERE LOWER(wallet) = ANY($1)',
        [['0xABC', '0xdef']]
      );
      expect(logger.info).toHaveBeenCalledWith('Portfolio timestamps updated', {
        walletsRequested: 2,
        rowsUpdated: 5
      });
    });

    it('falls back to zero when rowCount is undefined', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: undefined });

      await fetcher.batchUpdatePortfolioTimestamps(['0xabc']);

      expect(logger.info).toHaveBeenCalledWith('Portfolio timestamps updated', {
        walletsRequested: 1,
        rowsUpdated: 0
      });
    });

    it('logs failures without throwing', async () => {
      vi.spyOn(fetcher as unknown as { withDatabaseClient: (callback: unknown) => Promise<never> }, 'withDatabaseClient')
        .mockRejectedValueOnce(new Error('db error'));

      await expect(fetcher.batchUpdatePortfolioTimestamps(['0xabc'])).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith('Failed to update portfolio timestamps', {
        error: new Error('db error'),
        walletCount: 1
      });
    });
  });

  describe('fetchUsersByIds', () => {
    it('returns empty array for empty input', async () => {
      await expect(fetcher.fetchUsersByIds([])).resolves.toEqual([]);
      await expect(fetcher.fetchUsersByIds(null as unknown as string[])).resolves.toEqual([]);
      expect(mockGetDbClient).not.toHaveBeenCalled();
    });

    it('returns normalized filtered rows', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          { user_id: 'u1', wallet: '0xABC' },
          { user_id: null, wallet: '0xDEF' }
        ]
      });

      const result = await fetcher.fetchUsersByIds(['u1', 'u2']);

      expect(mockClient.query).toHaveBeenCalledWith(
        'select user_id, wallet from public.get_users_wallets_by_ids($1)',
        [['u1', 'u2']]
      );
      expect(result).toEqual([{ user_id: 'u1', wallet: '0xabc' }]);
    });

    it('propagates APIError instances', async () => {
      const apiError = new APIError('db error', 500, 'db', 'SupabaseFetcher');
      vi.spyOn(fetcher as unknown as { withDatabaseClient: (callback: unknown) => Promise<never> }, 'withDatabaseClient')
        .mockRejectedValueOnce(apiError);

      await expect(fetcher.fetchUsersByIds(['u1'])).rejects.toBe(apiError);
    });

    it('wraps generic and non-Error failures', async () => {
      const withDatabaseClientSpy = vi.spyOn(
        fetcher as unknown as { withDatabaseClient: (callback: unknown) => Promise<never> },
        'withDatabaseClient'
      );

      withDatabaseClientSpy.mockRejectedValueOnce(new Error('boom'));
      await expect(fetcher.fetchUsersByIds(['u1'])).rejects.toThrow('DB fetch by IDs failed: boom');

      withDatabaseClientSpy.mockRejectedValueOnce('String Error');
      await expect(fetcher.fetchUsersByIds(['u1'])).rejects.toThrow('DB fetch by IDs failed: Unknown error');
    });
  });

  describe('healthCheck', () => {
    it('returns healthy when ping and function lookup succeed', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ ok: 1 }] })
        .mockResolvedValueOnce({ rows: [{ exists: true }] });

      await expect(fetcher.healthCheck()).resolves.toEqual({ status: 'healthy' });
    });

    it('returns unhealthy when ping fails', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ ok: 0 }] })
        .mockResolvedValueOnce({ rows: [{ exists: true }] });

      await expect(fetcher.healthCheck()).resolves.toEqual({
        status: 'unhealthy',
        details: 'DB ping failed'
      });
    });

    it('returns unhealthy when the function is missing', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ ok: 1 }] })
        .mockResolvedValueOnce({ rows: [{ exists: false }] });

      await expect(fetcher.healthCheck()).resolves.toEqual({
        status: 'unhealthy',
        details: 'Function get_users_wallets_by_plan not found'
      });
    });

    it('returns unhealthy when the health check throws unexpectedly', async () => {
      vi.spyOn(fetcher as unknown as { withDatabaseClient: (callback: unknown) => Promise<never> }, 'withDatabaseClient')
        .mockRejectedValueOnce(new Error('health fail'));

      await expect(fetcher.healthCheck()).resolves.toEqual({
        status: 'unhealthy',
        details: 'health fail'
      });
    });
  });
});
