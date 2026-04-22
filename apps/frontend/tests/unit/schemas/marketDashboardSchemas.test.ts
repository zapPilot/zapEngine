import { describe, expect, it } from 'vitest';

import {
  marketDashboardResponseSchema,
  validateMarketDashboardResponse,
} from '@/schemas/api/analytics/dashboardSchemas';

describe('marketDashboardResponseSchema', () => {
  it('accepts nested ETH/BTC relative strength data', () => {
    const payload = {
      snapshots: [
        {
          snapshot_date: '2025-01-01',
          price_usd: 42000,
          dma_200: 38000,
          sentiment_value: 65,
          regime: 'g',
          eth_btc_relative_strength: {
            ratio: 0.0532,
            dma_200: 0.0498,
            is_above_dma: true,
          },
        },
      ],
      count: 1,
      token_symbol: 'BTC',
      days_requested: 365,
      timestamp: '2025-01-02T12:00:00Z',
    };

    expect(() => validateMarketDashboardResponse(payload)).not.toThrow();
    expect(marketDashboardResponseSchema.parse(payload)).toEqual(payload);
  });

  it('accepts missing relative strength data for backward compatibility', () => {
    const payload = {
      snapshots: [
        {
          snapshot_date: '2025-01-01',
          price_usd: 42000,
          dma_200: 38000,
          sentiment_value: 65,
          regime: 'g',
        },
      ],
      count: 1,
      token_symbol: 'BTC',
      days_requested: 365,
      timestamp: '2025-01-02T12:00:00Z',
    };

    expect(() => validateMarketDashboardResponse(payload)).not.toThrow();
  });
});
