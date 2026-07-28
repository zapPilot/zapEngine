import { ServiceLayerException } from '../../../../src/common/exceptions';
import { DatabaseService } from '../../../../src/database/database.service';
import { AnalyticsClientService } from '../../../../src/modules/notifications/analytics-client.service';
import { SupabaseUserService } from '../../../../src/modules/notifications/supabase-user.service';
import { createMockDatabaseService } from '../../../test-utils';

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
  describe('getReportRecipientsWithWallets', () => {
    it('returns subscribed users with wallets without consulting plans', async () => {
      const { service, dbMock } = createMocks();
      const qb = dbMock.serviceRole.queryBuilder;

      qb.mockResolvedThen({
        data: [
          {
            id: 'u-1',
            email: 'a@b.com',
            user_crypto_wallets: [{ wallet: '0xabc' }],
          },
        ],
        error: null,
      });

      const result = await service.getReportRecipientsWithWallets();
      expect(result).toHaveLength(1);
      expect(result[0]?.user.email).toBe('a@b.com');
      expect(result[0]?.wallets).toEqual(['0xabc']);
      expect(dbMock.mock.getServiceRoleClient).toHaveBeenCalled();
      expect(qb.eq).toHaveBeenCalledWith('is_subscribed_to_reports', true);
      expect(qb.not).toHaveBeenCalledWith('email', 'is', null);
      expect(qb.eq).not.toHaveBeenCalledWith('plan_code', 'vip');
    });

    it('returns every linked wallet on the user row', async () => {
      const { service, dbMock } = createMocks();
      dbMock.serviceRole.queryBuilder.mockResolvedThen({
        data: [
          {
            id: 'u-1',
            email: 'a@b.com',
            user_crypto_wallets: [{ wallet: '0xaaa' }, { wallet: '0xbbb' }],
          },
        ],
        error: null,
      });

      const result = await service.getReportRecipientsWithWallets();
      expect(result).toHaveLength(1);
      expect(result[0]?.wallets).toEqual(['0xaaa', '0xbbb']);
    });

    it('returns empty when no users match', async () => {
      const { service, dbMock } = createMocks();
      dbMock.serviceRole.queryBuilder.mockResolvedThen({
        data: [],
        error: null,
      });

      const result = await service.getReportRecipientsWithWallets();
      expect(result).toEqual([]);
    });

    it('throws ServiceLayerException on database error', async () => {
      const { service, dbMock } = createMocks();
      dbMock.serviceRole.queryBuilder.mockResolvedThen({
        data: null,
        error: { message: 'query failed' },
      });

      await expect(service.getReportRecipientsWithWallets()).rejects.toThrow(
        ServiceLayerException,
      );
    });

    it('skips users without email', async () => {
      const { service, dbMock } = createMocks();
      dbMock.serviceRole.queryBuilder.mockResolvedThen({
        data: [
          {
            id: 'u-1',
            email: null,
            user_crypto_wallets: [],
          },
        ],
        error: null,
      });

      const result = await service.getReportRecipientsWithWallets();
      expect(result).toHaveLength(0);
    });
  });

  describe('getReportRecipientWithWallets', () => {
    it('returns null when user not found', async () => {
      const { service, dbMock } = createMocks();
      dbMock.serviceRole.queryBuilder.mockResolvedThen({
        data: [],
        error: null,
      });

      const result = await service.getReportRecipientWithWallets('u-1');
      expect(result).toBeNull();
      expect(dbMock.serviceRole.queryBuilder.eq).toHaveBeenCalledWith(
        'id',
        'u-1',
      );
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

    it('propagates portfolio-not-found errors for job retry handling', async () => {
      const { service, analyticsClient } = createMocks();
      analyticsClient.getPortfolioTrendData.mockRejectedValue(
        new Error('portfolio not found'),
      );

      await expect(service.getBalanceHistory('u-1')).rejects.toThrow(
        'portfolio not found',
      );
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

    it('filters out invalid entries within daily_values array', async () => {
      const { service, analyticsClient } = createMocks();
      analyticsClient.getPortfolioTrendData.mockResolvedValue({
        daily_values: [
          null,
          { date: '2025-01-01', total_value_usd: 1000 },
          'not-an-object',
          { date: '', total_value_usd: 500 },
          { total_value_usd: 500 },
        ],
      });

      const result = await service.getBalanceHistory('u-1');
      expect(result).toHaveLength(1);
      expect(result[0]?.usd_value).toBe(1000);
    });
  });
});
