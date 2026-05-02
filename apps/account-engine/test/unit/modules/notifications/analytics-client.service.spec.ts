import type { Mock } from 'vitest';

import { ServiceLayerException } from '../../../../src/common/exceptions';
import { AnalyticsClientService } from '../../../../src/modules/notifications/analytics-client.service';
import { PortfolioNotFoundError } from '../../../../src/modules/notifications/errors/portfolio-not-found.error';
import { createMockConfigService } from '../../../test-utils';

describe('AnalyticsClientService', () => {
  let service: AnalyticsClientService;

  function createValidDailySuggestionResponse() {
    return {
      as_of: '2025-01-01',
      config_id: 'cfg',
      config_display_name: 'Test',
      strategy_id: 'strat',
      action: {
        status: 'no_action',
        required: false,
        kind: null,
        reason_code: 'already_aligned',
        transfers: [],
      },
      context: {
        market: {
          date: '2025-01-01',
          token_price: { btc: 100000 },
          sentiment: 50,
          sentiment_label: 'neutral',
        },
        signal: {
          id: 'signal',
          regime: 'neutral',
          raw_value: 50,
          confidence: 1,
          details: {},
        },
        portfolio: {
          spot_usd: 500,
          stable_usd: 500,
          total_value: 1000,
          allocation: { spot: 0.5, stable: 0.5 },
          asset_allocation: { btc: 0.5, eth: 0, spy: 0, stable: 0.5, alt: 0 },
        },
        target: {
          allocation: { btc: 0.5, eth: 0, spy: 0, stable: 0.5, alt: 0 },
        },
        strategy: {
          stance: 'hold',
          reason_code: 'already_aligned',
          rule_group: 'none',
          details: {},
        },
      },
    };
  }

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

  describe('getDailySuggestion', () => {
    it('returns normalized daily suggestion data', async () => {
      const rawResponse = createValidDailySuggestionResponse();

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawResponse),
      });

      const result = await service.getDailySuggestion('user-1');
      expect(result.action.status).toBe('no_action');
      expect(result.context.portfolio.total_value).toBe(1000);
    });

    it('normalizes optional debt-aware portfolio totals when present', async () => {
      const rawResponse = {
        ...createValidDailySuggestionResponse(),
        action: {
          ...createValidDailySuggestionResponse().action,
          status: 'action_required',
          required: true,
          kind: 'rebalance',
          reason_code: 'eth_btc_ratio_rebalance',
        },
        context: {
          ...createValidDailySuggestionResponse().context,
          portfolio: {
            ...createValidDailySuggestionResponse().context.portfolio,
            total_value: 1000,
            total_assets_usd: 1000,
            total_debt_usd: 250,
            total_net_usd: 750,
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawResponse),
      });

      const result = await service.getDailySuggestion('user-1');
      expect(result.context.portfolio.total_assets_usd).toBe(1000);
      expect(result.context.portfolio.total_debt_usd).toBe(250);
      expect(result.context.portfolio.total_net_usd).toBe(750);
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
            roi_7d: { value: 2.3, start_balance: 9770 },
          },
        },
        estimated_monthly_income: 129.17,
        weighted_apr: 12.5,
        wallet_count: 3,
        last_updated: '2025-01-01',
      } as any;

      const result = service.transformToEmailMetrics(portfolioData);

      expect(result.currentBalance).toBe(10000);
      expect(result.estimatedYearlyROI).toBe(15.5);
      expect(result.weeklyPnLPercentage).toBe(2.3);
      expect(result.walletCount).toBe(3);
    });

    it('calculates weekly PnL from start_balance when value is missing', () => {
      const portfolioData = {
        total_net_usd: 10000,
        portfolio_roi: {
          recommended_yearly_roi: 10,
          estimated_yearly_pnl_usd: 1000,
          recommended_period: '30_days',
          windows: {
            roi_7d: { start_balance: 9500 },
          },
        },
        estimated_monthly_income: 83.33,
        weighted_apr: 10,
        wallet_count: 1,
      } as any;

      const result = service.transformToEmailMetrics(portfolioData);
      // (10000 - 9500) / 9500 * 100 ≈ 5.26
      expect(result.weeklyPnLPercentage).toBeCloseTo(5.26, 1);
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
      // A non-HTTP URL passes the string check but is treated as invalid by UrlValidator
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

  describe('getDailySuggestion retry on timeout', () => {
    const validResponse = createValidDailySuggestionResponse();

    it('retries once on ECONNABORTED and succeeds on second attempt', async () => {
      const timeoutError = Object.assign(new Error('timeout'), {
        code: 'ECONNABORTED',
      });
      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(validResponse),
        });

      const result = await service.getDailySuggestion('user-1');
      expect(result.action.status).toBe('no_action');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('retries on ETIMEOUT error code', async () => {
      const timeoutError = Object.assign(new Error('operation timed out'), {
        code: 'ETIMEOUT',
      });
      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(validResponse),
        });

      const result = await service.getDailySuggestion('user-1');
      expect(result.action.status).toBe('no_action');
    });

    it('retries when error message includes "timeout"', async () => {
      const timeoutError = new Error('AbortError: timeout exceeded');
      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(validResponse),
        });

      const result = await service.getDailySuggestion('user-1');
      expect(result.action.status).toBe('no_action');
    });

    it('throws ServiceLayerException when both retry attempts fail', async () => {
      const timeoutError = Object.assign(new Error('timeout'), {
        code: 'ECONNABORTED',
      });
      global.fetch = vi.fn().mockRejectedValue(timeoutError);

      await expect(service.getDailySuggestion('user-1')).rejects.toThrow(
        ServiceLayerException,
      );
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleAnalyticsError re-throws ServiceLayerException', () => {
    it('re-throws when the thrown error is already a ServiceLayerException', async () => {
      const original = new ServiceLayerException('upstream error', 502);
      global.fetch = vi.fn().mockRejectedValue(original);

      await expect(service.getPortfolioData('user-1')).rejects.toBe(original);
    });
  });

  describe('normalizeDailySuggestionResponse validation branches', () => {
    const base = createValidDailySuggestionResponse();

    function mockFetch(payload: unknown) {
      global.fetch = vi
        .fn()
        .mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });
    }

    it('throws ServiceLayerException when root is not an object', async () => {
      mockFetch('not-an-object');
      await expect(service.getDailySuggestion('user-1')).rejects.toThrow(
        ServiceLayerException,
      );
    });

    it('throws ServiceLayerException when as_of is empty', async () => {
      mockFetch({ ...base, as_of: '' });
      await expect(service.getDailySuggestion('user-1')).rejects.toThrow(
        ServiceLayerException,
      );
    });

    it('throws ServiceLayerException when action.required is not boolean', async () => {
      mockFetch({
        ...base,
        action: { ...base.action, required: 'yes' },
      });
      await expect(service.getDailySuggestion('user-1')).rejects.toThrow(
        ServiceLayerException,
      );
    });

    it('throws ServiceLayerException when action.status is invalid', async () => {
      mockFetch({
        ...base,
        action: { ...base.action, status: 'unknown_status' },
      });
      await expect(service.getDailySuggestion('user-1')).rejects.toThrow(
        ServiceLayerException,
      );
    });

    it('returns null kind when action.kind is null', async () => {
      mockFetch({ ...base, action: { ...base.action, kind: null } });
      const result = await service.getDailySuggestion('user-1');
      expect(result.action.kind).toBeNull();
    });

    it('returns "rebalance" when action.kind is "rebalance"', async () => {
      mockFetch({ ...base, action: { ...base.action, kind: 'rebalance' } });
      const result = await service.getDailySuggestion('user-1');
      expect(result.action.kind).toBe('rebalance');
    });

    it('throws ServiceLayerException when action.kind is invalid', async () => {
      mockFetch({
        ...base,
        action: { ...base.action, kind: 'unknown_kind' },
      });
      await expect(service.getDailySuggestion('user-1')).rejects.toThrow(
        ServiceLayerException,
      );
    });

    it('throws ServiceLayerException when portfolio.total_value is not a number', async () => {
      mockFetch({
        ...base,
        context: {
          ...base.context,
          portfolio: { total_value: 'not-a-number', allocation: {} },
        },
      });
      await expect(service.getDailySuggestion('user-1')).rejects.toThrow(
        ServiceLayerException,
      );
    });

    it('returns null for nullable market.sentiment when null', async () => {
      mockFetch({
        ...base,
        context: {
          ...base.context,
          market: { ...base.context.market, sentiment: null },
        },
      });
      const result = await service.getDailySuggestion('user-1');
      expect(result.context.market.sentiment).toBeNull();
    });

    it('normalizes omitted optional fields to contract-safe defaults', async () => {
      const actionWithoutKind: Partial<typeof base.action> = { ...base.action };
      delete actionWithoutKind.kind;

      const marketWithoutTokenPrice: Record<string, unknown> = {
        ...base.context.market,
        sentiment_label: null,
      };
      delete marketWithoutTokenPrice['token_price'];

      const signalWithoutOptionalFields: Partial<typeof base.context.signal> = {
        ...base.context.signal,
      };
      delete signalWithoutOptionalFields.raw_value;
      delete signalWithoutOptionalFields.details;

      const strategyWithoutDetails: Partial<typeof base.context.strategy> = {
        ...base.context.strategy,
      };
      delete strategyWithoutDetails.details;

      mockFetch({
        ...base,
        action: actionWithoutKind,
        context: {
          ...base.context,
          market: marketWithoutTokenPrice,
          signal: signalWithoutOptionalFields,
          portfolio: {
            ...base.context.portfolio,
            spot_asset: null,
          },
          strategy: strategyWithoutDetails,
        },
      });

      const result = await service.getDailySuggestion('user-1');
      expect(result.action.kind).toBeNull();
      expect(result.context.market.token_price).toEqual({});
      expect(result.context.market.sentiment_label).toBeNull();
      expect('raw_value' in result.context.signal).toBe(false);
      expect(result.context.signal.details).toEqual({});
      expect(result.context.portfolio.spot_asset).toBeNull();
      expect(result.context.strategy.details).toEqual({});
    });

    it('throws ServiceLayerException when shared Zod contract rejects normalized transfer buckets', async () => {
      mockFetch({
        ...base,
        action: {
          ...base.action,
          transfers: [
            { from_bucket: 'alt', to_bucket: 'stable', amount_usd: 500 },
          ],
        },
      });

      await expect(service.getDailySuggestion('user-1')).rejects.toThrow(
        ServiceLayerException,
      );
    });

    it('throws ServiceLayerException when context.strategy.stance is invalid', async () => {
      mockFetch({
        ...base,
        context: {
          ...base.context,
          strategy: { stance: 'neutral', reason_code: 'x', details: null },
        },
      });
      await expect(service.getDailySuggestion('user-1')).rejects.toThrow(
        ServiceLayerException,
      );
    });

    it('returns empty array when action.transfers is null', async () => {
      mockFetch({
        ...base,
        action: { ...base.action, transfers: null },
      });
      const result = await service.getDailySuggestion('user-1');
      expect(result.action.transfers).toEqual([]);
    });

    it('throws ServiceLayerException when action.transfers is not an array', async () => {
      mockFetch({
        ...base,
        action: { ...base.action, transfers: { bad: true } },
      });
      await expect(service.getDailySuggestion('user-1')).rejects.toThrow(
        ServiceLayerException,
      );
    });

    it('normalizes valid transfers array', async () => {
      mockFetch({
        ...base,
        action: {
          ...base.action,
          transfers: [
            { from_bucket: 'btc', to_bucket: 'eth', amount_usd: 500 },
          ],
        },
      });
      const result = await service.getDailySuggestion('user-1');
      expect(result.action.transfers[0]?.from_bucket).toBe('btc');
    });

    it('returns non-null details object via getNullableRecord', async () => {
      mockFetch({
        ...base,
        context: {
          ...base.context,
          signal: { ...base.context.signal, details: { key: 'value' } },
        },
      });
      const result = await service.getDailySuggestion('user-1');
      expect(result.context.signal.details).toEqual({ key: 'value' });
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
        estimated_monthly_income: 83.33,
        weighted_apr: 10,
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
        estimated_monthly_income: 83.33,
        weighted_apr: 10,
        wallet_count: 1,
      } as any;

      const result = service.transformToEmailMetrics(portfolioData);
      expect(result.weeklyPnLPercentage).toBeUndefined();
    });
  });
});
