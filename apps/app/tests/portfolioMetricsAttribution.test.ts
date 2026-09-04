import type { DailyYieldReturnsResponse } from '@zapengine/app-core/services';
import { describe, expect, it } from 'vitest';

import {
  attachDailyAttribution,
  attributionContributorKey,
} from '@/integration/portfolioMetrics';

/**
 * Mirrors the backend identity: a protocol's `yield_return_usd` is the sum of
 * its tokens' amount-change contributions, and `market_return_usd` is the
 * separate price effect.
 */
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
      yield_return_usd: 24,
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
      yield_return_usd: 1,
      tokens: [
        {
          symbol: 'USDC',
          amount_change: 1,
          current_price: 1,
          yield_return_usd: 1,
          market_return_usd: 0,
        },
      ],
    },
  ],
};

describe('attachDailyAttribution', () => {
  it('aggregates market and balance contributions and reconciles the residual', () => {
    const points = attachDailyAttribution(
      [
        { date: '2026-08-20', total_value_usd: 1_000 },
        { date: '2026-08-21T00:00:00Z', total_value_usd: 1_050 },
      ],
      yieldData,
    );

    expect(points[1]?.attribution).toEqual([
      { kind: 'amount', label: 'Aave', valueUsd: 24 },
      { kind: 'market', label: 'ETH', valueUsd: 20 },
      { kind: 'residual', valueUsd: 5 },
      { kind: 'amount', label: 'Morpho', valueUsd: 1 },
    ]);
    expect(
      points[1]?.attribution?.reduce((sum, item) => sum + item.valueUsd, 0),
    ).toBeCloseTo(50);
  });

  it('does not invent attribution for the first trend point without an adjacent change', () => {
    const [point] = attachDailyAttribution(
      [{ date: '2026-08-20', total_value_usd: 100 }],
      yieldData,
    );
    expect(point?.attribution).toBeUndefined();
  });

  it('attributes nothing when the endpoint proved no contributor for the day', () => {
    const points = attachDailyAttribution(
      [
        { date: '2026-08-20', total_value_usd: 1_000 },
        { date: '2026-08-21', total_value_usd: 11_000 },
      ],
      undefined,
    );

    // A lone residual equal to the whole move looks like an explanation while
    // explaining nothing, so a $10k deposit must not surface as attribution.
    expect(points.every((point) => point.attribution === undefined)).toBe(true);
  });

  it('skips days the endpoint has no rows for', () => {
    const points = attachDailyAttribution(
      [
        { date: '2026-08-21', total_value_usd: 1_000 },
        { date: '2026-08-22', total_value_usd: 1_050 },
      ],
      yieldData,
    );
    expect(points[1]?.attribution).toBeUndefined();
  });

  it('keys residual rows without borrowing a display string', () => {
    expect(attributionContributorKey({ kind: 'residual', valueUsd: 5 })).toBe(
      'residual',
    );
    expect(
      attributionContributorKey({ kind: 'market', label: 'ETH', valueUsd: 1 }),
    ).toBe('market:ETH');
  });
});
