import type { Mock } from 'vitest';

import { ServiceLayerException } from '../../../../src/common/exceptions';
import { AnalyticsClientService } from '../../../../src/modules/notifications/analytics-client/client';
import { PortfolioNotFoundError } from '../../../../src/modules/notifications/errors/portfolio-not-found.error';
import { createMockConfigService } from '../../../test-utils';

describe('AnalyticsClientService', () => {
  let service: AnalyticsClientService;

  beforeEach(() => {
    service = new AnalyticsClientService(createMockConfigService());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('throws when ANALYTICS_ENGINE_URL is not configured', () => {
      expect(
        () =>
          new AnalyticsClientService(
            createMockConfigService({ ANALYTICS_ENGINE_URL: '' }),
          ),
      ).toThrow('ANALYTICS_ENGINE_URL');
    });
  });

  describe('getPortfolioData', () => {
    it('returns portfolio data on success', async () => {
      const mockData = { total_net_usd: 5000, wallet_count: 2 };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await service.getPortfolioData('user-1');
      expect(result).toEqual(mockData);
    });

    it('throws PortfolioNotFoundError on 404', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not found'),
      });

      await expect(service.getPortfolioData('user-1')).rejects.toThrow(
        PortfolioNotFoundError,
      );
    });

    it('throws ServiceLayerException on 500', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal error'),
      });

      await expect(service.getPortfolioData('user-1')).rejects.toThrow(
        ServiceLayerException,
      );
    });

    it('throws ServiceLayerException on ECONNREFUSED', async () => {
      const error = new Error('connect ECONNREFUSED') as Error & {
        code?: string;
      };
      error.code = 'ECONNREFUSED';
      global.fetch = vi.fn().mockRejectedValue(error);

      await expect(service.getPortfolioData('user-1')).rejects.toThrow(
        ServiceLayerException,
      );
    });
  });

  describe('transformToEmailMetrics', () => {
    it('transforms portfolio data to email metrics', () => {
      const portfolioData = {
        total_net_usd: 10000,
        portfolio_roi: {
          recommended_yearly_roi: 15.5,
          estimated_yearly_pnl_usd: 1550,
          recommended_period: '90_days',
          windows: {
            roi_7d: {
              value: 2.3,
              data_points: 7,
              start_balance: 9770,
              days_spanned: 6,
            },
          },
        },
        wallet_count: 3,
        last_updated: '2025-01-01',
      } as any;

      const result = service.transformToEmailMetrics(portfolioData);

      expect(result.currentBalance).toBe(10000);
      expect(result.estimatedYearlyROI).toBe(15.5);
      expect(result.weeklyPnLPercentage).toBe(2.3);
      expect(result.walletCount).toBe(3);
    });

    it('does not treat incomplete ROI metadata as a weekly return', () => {
      const portfolioData = {
        total_net_usd: 10000,
        portfolio_roi: {
          recommended_yearly_roi: 10,
          estimated_yearly_pnl_usd: 1000,
          recommended_period: '30_days',
          windows: {
            roi_7d: {
              value: 0,
              data_points: 0,
              start_balance: 0,
              days_spanned: 0,
            },
          },
        },
        wallet_count: 1,
      } as any;

      const result = service.transformToEmailMetrics(portfolioData);
      expect(result.weeklyPnLPercentage).toBeUndefined();
    });

    it('preserves a real zero return for a complete seven-day window', () => {
      const portfolioData = {
        total_net_usd: 10000,
        portfolio_roi: {
          recommended_yearly_roi: 10,
          estimated_yearly_pnl_usd: 1000,
          recommended_period: '30_days',
          windows: {
            roi_7d: {
              value: 0,
              data_points: 7,
              start_balance: 10000,
              days_spanned: 6,
            },
          },
        },
        wallet_count: 1,
      } as any;

      const result = service.transformToEmailMetrics(portfolioData);
      expect(result.weeklyPnLPercentage).toBe(0);
    });
  });

  describe('validateAnalyticsConnection', () => {
    it('returns connected on success', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' }),
      });

      const result = await service.validateAnalyticsConnection();
      expect(result.connected).toBe(true);
    });

    it('returns not connected on failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('timeout'));

      const result = await service.validateAnalyticsConnection();
      expect(result.connected).toBe(false);
    });
  });

  describe('getAnalyticsEngineUrl', () => {
    it('returns the configured URL', () => {
      expect(service.getAnalyticsEngineUrl()).toContain('127.0.0.1');
    });
  });

  describe('getPortfolioTrendData', () => {
    it('returns trend data on success', async () => {
      const mockData = { trend: [{ date: '2025-01-01', value: 1000 }] };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await service.getPortfolioTrendData('user-1');
      expect(result).toEqual(mockData);
      // params should include days=365
      const calledUrl = (global.fetch as Mock).mock.calls[0]?.[0];
      expect(calledUrl).toContain('days=365');
    });
  });

  describe('constructor URL resolution', () => {
    it('logs when URL is normalized (localhost → 127.0.0.1)', () => {
      const s = new AnalyticsClientService(
        createMockConfigService({
          ANALYTICS_ENGINE_URL: 'http://localhost:8000',
        }),
      );
      expect(s.getAnalyticsEngineUrl()).toContain('127.0.0.1');
    });

    it('derives trends URL by changing port when on default base port', () => {
      // Uses DEFAULT_BASE_PORT (8000) → should change to DEFAULT_TRENDS_PORT (8001)
      const s = new AnalyticsClientService(
        createMockConfigService({
          ANALYTICS_ENGINE_URL: 'http://127.0.0.1:8000',
        }),
      );
      expect(s.getAnalyticsEngineUrl()).toContain('8000');
    });

    it('falls back to default trends port when URL is invalid', () => {
      // A non-HTTP URL passes the string check but is rejected by URL parsing.
      expect(
        () =>
          new AnalyticsClientService(
            createMockConfigService({
              ANALYTICS_ENGINE_URL: 'ftp://127.0.0.1:8000',
            }),
          ),
      ).not.toThrow();
    });
  });

  describe('handleAnalyticsError re-throws ServiceLayerException', () => {
    it('re-throws when the thrown error is already a ServiceLayerException', async () => {
      const original = new ServiceLayerException('upstream error', 502);
      global.fetch = vi.fn().mockRejectedValue(original);

      await expect(service.getPortfolioData('user-1')).rejects.toBe(original);
    });
  });

  describe('transformToEmailMetrics weeklyPnLPercentage edge cases', () => {
    it('returns undefined weeklyPnLPercentage when no valid roi7d data', () => {
      const portfolioData = {
        total_net_usd: 10000,
        portfolio_roi: {
          recommended_yearly_roi: 10,
          estimated_yearly_pnl_usd: 1000,
          recommended_period: '30_days',
          windows: {}, // no roi_7d
        },
        wallet_count: 1,
      } as any;

      const result = service.transformToEmailMetrics(portfolioData);
      expect(result.weeklyPnLPercentage).toBeUndefined();
    });

    it('returns undefined when roi7d start_balance is zero', () => {
      const portfolioData = {
        total_net_usd: 10000,
        portfolio_roi: {
          recommended_yearly_roi: 10,
          estimated_yearly_pnl_usd: 1000,
          recommended_period: '30_days',
          windows: { roi_7d: { start_balance: 0 } }, // start_balance = 0, can't divide
        },
        wallet_count: 1,
      } as any;

      const result = service.transformToEmailMetrics(portfolioData);
      expect(result.weeklyPnLPercentage).toBeUndefined();
    });
  });
});
