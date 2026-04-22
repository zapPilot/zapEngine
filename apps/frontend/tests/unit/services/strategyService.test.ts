import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { httpUtils } from '@/lib/http';
import {
  getDailySuggestion,
  getStrategyConfigs,
  type StrategyConfigsResponse,
  type StrategyPreset,
} from '@/services/strategyService';

const analyticsEngineGetSpy = vi.spyOn(httpUtils.analyticsEngine, 'get');

function createMockPreset(
  overrides: Partial<StrategyPreset> = {},
): StrategyPreset {
  return {
    config_id: 'test_preset',
    display_name: 'Test Preset',
    description: 'Test description',
    strategy_id: 'dma_gated_fgi',
    params: {},
    is_default: false,
    is_benchmark: false,
    ...overrides,
  };
}

function createMockResponse(
  overrides: Partial<StrategyConfigsResponse> = {},
): StrategyConfigsResponse {
  return {
    strategies: [],
    presets: [
      createMockPreset({
        config_id: 'dma_gated_fgi_default',
        is_default: true,
      }),
    ],
    backtest_defaults: { days: 500, total_capital: 10000 },
    ...overrides,
  };
}

describe('strategyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyticsEngineGetSpy.mockReset();
  });

  afterAll(() => {
    analyticsEngineGetSpy.mockRestore();
  });

  describe('getStrategyConfigs', () => {
    it('calls the correct endpoint', async () => {
      analyticsEngineGetSpy.mockResolvedValue(createMockResponse());

      await getStrategyConfigs();

      expect(analyticsEngineGetSpy).toHaveBeenCalledWith(
        '/api/v3/strategy/configs',
      );
    });

    it('returns the response envelope as-is', async () => {
      const mockResponse = createMockResponse();
      analyticsEngineGetSpy.mockResolvedValue(mockResponse);

      const result = await getStrategyConfigs();

      expect(result).toEqual(mockResponse);
    });

    it('propagates HTTP errors', async () => {
      analyticsEngineGetSpy.mockRejectedValue(new Error('Network error'));

      await expect(getStrategyConfigs()).rejects.toThrow('Network error');
    });
  });

  describe('getDailySuggestion', () => {
    const mockSuggestion = {
      as_of: '2026-03-07',
      config_id: 'dma_gated_fgi_default',
      config_display_name: 'DMA Gated FGI Default',
      strategy_id: 'dma_gated_fgi',
      action: {
        status: 'no_action',
        required: false,
        kind: null,
        reason_code: 'already_aligned',
        transfers: [],
      },
      context: {
        market: {
          date: '2026-03-07',
          token_price: { btc: 68148.28 },
          sentiment: 18,
          sentiment_label: 'extreme_fear',
        },
        portfolio: {
          spot_usd: 7000,
          stable_usd: 3000,
          total_value: 10000,
          allocation: {
            spot: 0.7,
            stable: 0.3,
          },
          asset_allocation: {
            btc: 0.7,
            eth: 0,
            stable: 0.3,
            alt: 0,
          },
        },
        signal: {
          id: 'dma_gated_fgi',
          regime: 'extreme_fear',
          raw_value: 18,
          confidence: 1,
          details: {
            dma: {
              dma_200: 65000,
              distance: 0.048,
              zone: 'above',
              cross_event: null,
              cooldown_active: false,
              cooldown_remaining_days: 0,
              cooldown_blocked_zone: null,
              fgi_slope: -2,
            },
          },
        },
        target: {
          allocation: {
            spot: 0.7,
            stable: 0.3,
          },
          asset_allocation: {
            btc: 0.7,
            eth: 0,
            stable: 0.3,
            alt: 0,
          },
        },
        strategy: {
          stance: 'hold',
          reason_code: 'already_aligned',
          rule_group: 'none',
          details: {},
        },
      },
    };

    it('calls the user-specific endpoint', async () => {
      analyticsEngineGetSpy.mockResolvedValue(mockSuggestion);

      await getDailySuggestion('user-123');

      expect(analyticsEngineGetSpy).toHaveBeenCalledWith(
        '/api/v3/strategy/daily-suggestion/user-123',
      );
    });

    it('returns the daily suggestion response as-is', async () => {
      analyticsEngineGetSpy.mockResolvedValue(mockSuggestion);

      const result = await getDailySuggestion('user-456');

      expect(result).toEqual(mockSuggestion);
    });

    it('appends config_id to the query string', async () => {
      analyticsEngineGetSpy.mockResolvedValue(mockSuggestion);

      await getDailySuggestion('user-123', 'dma_gated_fgi_default');

      expect(analyticsEngineGetSpy).toHaveBeenCalledWith(
        '/api/v3/strategy/daily-suggestion/user-123?config_id=dma_gated_fgi_default',
      );
    });

    it('omits the query string when config_id is undefined', async () => {
      analyticsEngineGetSpy.mockResolvedValue(mockSuggestion);

      await getDailySuggestion('user-123', undefined);

      expect(analyticsEngineGetSpy).toHaveBeenCalledWith(
        '/api/v3/strategy/daily-suggestion/user-123',
      );
    });
  });
});
