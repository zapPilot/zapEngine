import { ServiceLayerException } from '@/common/exceptions';
import { DatabaseService } from '@/database/database.service';
import { AnalyticsClientService } from '@/modules/notifications/analytics-client.service';
import { PortfolioNotFoundError } from '@/modules/notifications/errors/portfolio-not-found.error';
import { SupabaseUserService } from '@/modules/notifications/supabase-user.service';
import { createMockDatabaseService } from '@/test-utils';

function createMocks() {
  const dbMock = createMockDatabaseService();
  const analyticsClient = {
    getPortfolioTrendData: vi.fn(),
    getAnalyticsEngineUrl: vi.fn().mockReturnValue('http://localhost:8001'),
  };

  const service = new SupabaseUserService(
    dbMock.mock as unknown as DatabaseService,
    analyticsClient as unknown as AnalyticsClientService,
  );

  return { service, dbMock, analyticsClient };
}

describe('SupabaseUserService', () => {
  describe('getUsersWithAllWallets', () => {
    it('returns users with wallets from VIP subscriptions', async () => {
      const { service, dbMock } = createMocks();
      const qb = dbMock.anon.queryBuilder;

      qb.mockResolvedThen({
        data: [
          {
            user_id: 'u-1',
            ends_at: null,
            users: {
              id: 'u-1',
              email: 'a@b.com',
              user_crypto_wallets: [{ wallet: '0xabc' }],
            },
          },
        ],
        error: null,
      });

      const result = await service.getUsersWithAllWallets();
      expect(result).toHaveLength(1);
      expect(result[0]?.user.email).toBe('a@b.com');
      expect(result[0]?.wallets).toEqual(['0xabc']);
    });

    it('returns empty when no users match', async () => {
      const { service, dbMock } = createMocks();
      dbMock.anon.queryBuilder.mockResolvedThen({ data: [], error: null });

      const result = await service.getUsersWithAllWallets();
      expect(result).toEqual([]);
    });

    it('throws ServiceLayerException on database error', async () => {
      const { service, dbMock } = createMocks();
      dbMock.anon.queryBuilder.mockResolvedThen({
        data: null,
        error: { message: 'query failed' },
      });

      await expect(service.getUsersWithAllWallets()).rejects.toThrow(
        ServiceLayerException,
      );
    });

    it('filters out expired subscriptions', async () => {
      const { service, dbMock } = createMocks();
      dbMock.anon.queryBuilder.mockResolvedThen({
        data: [
          {
            user_id: 'u-1',
            ends_at: '2020-01-01T00:00:00Z',
            users: {
              id: 'u-1',
              email: 'a@b.com',
              user_crypto_wallets: [{ wallet: '0x1' }],
            },
          },
        ],
        error: null,
      });

      const result = await service.getUsersWithAllWallets();
      expect(result).toHaveLength(0);
    });

    it('skips users without email', async () => {
      const { service, dbMock } = createMocks();
      dbMock.anon.queryBuilder.mockResolvedThen({
        data: [
          {
            user_id: 'u-1',
            ends_at: null,
            users: { id: 'u-1', email: null, user_crypto_wallets: [] },
          },
        ],
        error: null,
      });

      const result = await service.getUsersWithAllWallets();
      expect(result).toHaveLength(0);
    });
  });

  describe('getUserWithWallets', () => {
    it('returns null when user not found', async () => {
      const { service, dbMock } = createMocks();
      dbMock.anon.queryBuilder.mockResolvedThen({ data: [], error: null });

      const result = await service.getUserWithWallets('u-1');
      expect(result).toBeNull();
    });
  });

  describe('getBalanceHistory', () => {
    it('returns sorted balance history', async () => {
      const { service, analyticsClient } = createMocks();
      analyticsClient.getPortfolioTrendData.mockResolvedValue({
        daily_values: [
          { date: '2025-01-01', total_value_usd: 1000 },
          { date: '2025-01-02', total_value_usd: 1100 },
        ],
      });

      const result = await service.getBalanceHistory('u-1');
      expect(result).toHaveLength(2);
      // Should be sorted newest first
      expect(result[0]?.usd_value).toBe(1100);
    });

    it('returns empty array when portfolio not found', async () => {
      const { service, analyticsClient } = createMocks();
      analyticsClient.getPortfolioTrendData.mockRejectedValue(
        new PortfolioNotFoundError('u-1'),
      );

      const result = await service.getBalanceHistory('u-1');
      expect(result).toEqual([]);
    });

    it('propagates non-portfolio errors', async () => {
      const { service, analyticsClient } = createMocks();
      analyticsClient.getPortfolioTrendData.mockRejectedValue(
        new Error('Network error'),
      );

      await expect(service.getBalanceHistory('u-1')).rejects.toThrow(
        'Network error',
      );
    });

    it('returns empty for invalid daily_values', async () => {
      const { service, analyticsClient } = createMocks();
      analyticsClient.getPortfolioTrendData.mockResolvedValue({
        daily_values: 'not-an-array',
      });

      const result = await service.getBalanceHistory('u-1');
      expect(result).toEqual([]);
    });
  });

  describe('getEmailSubscriptions', () => {
    it('returns subscribed users', async () => {
      const { service, dbMock } = createMocks();
      dbMock.anon.queryBuilder.mockResolvedThen({
        data: [
          {
            user_id: 'u-1',
            ends_at: null,
            users: {
              id: 'u-1',
              email: 'a@b.com',
              user_crypto_wallets: [{ wallet: '0x1' }],
            },
          },
        ],
        error: null,
      });

      const result = await service.getEmailSubscriptions();
      expect(result).toHaveLength(1);
      expect(result[0]?.email).toBe('a@b.com');
    });
  });
});
