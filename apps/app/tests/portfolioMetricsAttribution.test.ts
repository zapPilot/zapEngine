import type { DailyYieldReturnsResponse } from '@zapengine/app-core/services';
import { describe, expect, it } from 'vitest';

import { attachDailyAttribution } from '@/integration/portfolioMetrics';

const yieldData: DailyYieldReturnsResponse = {
  user_id: 'user',
  period: {
    start_date: '2026-08-20',
    end_date: '2026-08-21',
    days: 2,
  },
  daily_returns: [
    {
      date: '2026-08-21',
      protocol_name: 'Aave',
      chain: 'ethereum',
      position_type: 'Lending',
      yield_return_usd: 4,
      tokens: [
        {
          symbol: 'ETH',
          amount_change: 0.01,
          current_price: 2_400,
          yield_return_usd: 24,
          market_return_usd: 20,
        },
      ],
    },
    {
      date: '2026-08-21',
      protocol_name: 'Morpho',
      chain: 'base',
      position_type: 'Lending',
      yield_return_usd: -1,
      tokens: [
        {
          symbol: 'USDC',
          amount_change: -1,
          current_price: 1,
          yield_return_usd: -1,
          market_return_usd: 0,
        },
      ],
    },
  ],
};

describe('attachDailyAttribution', () => {
  it('aggregates market and protocol contributions and reconciles the residual', () => {
    const points = attachDailyAttribution(
      [
        { date: '2026-08-20', total_value_usd: 100 },
        { date: '2026-08-21T00:00:00Z', total_value_usd: 130 },
      ],
      yieldData,
    );

    expect(points[1]?.attribution).toEqual([
      { kind: 'market', label: 'ETH', valueUsd: 20 },
      { kind: 'residual', label: 'Other / flows', valueUsd: 7 },
      { kind: 'yield', label: 'Aave', valueUsd: 4 },
      { kind: 'yield', label: 'Morpho', valueUsd: -1 },
    ]);
    expect(
      points[1]?.attribution?.reduce((sum, item) => sum + item.valueUsd, 0),
    ).toBeCloseTo(30);
  });

  it('does not invent attribution for the first trend point without an adjacent change', () => {
    const [point] = attachDailyAttribution(
      [{ date: '2026-08-20', total_value_usd: 100 }],
      undefined,
    );
    expect(point?.attribution).toBeUndefined();
  });
});
