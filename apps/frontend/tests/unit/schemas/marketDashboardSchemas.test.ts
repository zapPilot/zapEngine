import { describe, expect, it } from 'vitest';

import {
  marketDashboardResponseSchema,
  validateMarketDashboardResponse,
} from '@/schemas/api/analytics/dashboardSchemas';

describe('marketDashboardResponseSchema', () => {
  it('accepts a snapshot with btc / eth / eth_btc / fgi series', () => {
    const payload = {
      series: {
        btc: {
          kind: 'asset',
          unit: 'usd',
          label: 'BTC',
          frequency: 'daily',
          color_hint: '#FFFFFF',
          scale: null,
        },
        eth: {
          kind: 'asset',
          unit: 'usd',
          label: 'ETH',
          frequency: 'daily',
          color_hint: '#627EEA',
          scale: null,
        },
        fgi: {
          kind: 'gauge',
          unit: 'score',
          label: 'Fear & Greed',
          frequency: 'daily',
          color_hint: '#10B981',
          scale: [0, 100],
        },
      },
      snapshots: [
        {
          snapshot_date: '2025-01-01',
          values: {
            btc: {
              value: 42000,
              indicators: { dma_200: { value: 38000, is_above: true } },
              tags: {},
            },
            eth: {
              value: 3200,
              indicators: { dma_200: { value: 3000, is_above: true } },
              tags: {},
            },
            eth_btc: {
              value: 0.0532,
              indicators: { dma_200: { value: 0.0498, is_above: true } },
              tags: {},
            },
            fgi: {
              value: 65,
              indicators: {},
              tags: { regime: 'g' },
            },
          },
        },
      ],
      meta: {
        primary_series: 'btc',
        days_requested: 365,
        count: 1,
        timestamp: '2025-01-02T12:00:00Z',
      },
    };

    expect(() => validateMarketDashboardResponse(payload)).not.toThrow();
    expect(marketDashboardResponseSchema.parse(payload)).toEqual(payload);
  });

  it('defaults missing indicators / tags maps to empty objects', () => {
    const payload = {
      series: {},
      snapshots: [
        {
          snapshot_date: '2025-01-01',
          values: {
            btc: { value: 42000 },
          },
        },
      ],
      meta: {
        primary_series: 'btc',
        days_requested: 365,
        count: 1,
        timestamp: '2025-01-02T12:00:00Z',
      },
    };

    const parsed = marketDashboardResponseSchema.parse(payload);
    expect(parsed.snapshots[0]?.values['btc']?.indicators).toEqual({});
    expect(parsed.snapshots[0]?.values['btc']?.tags).toEqual({});
  });
});
