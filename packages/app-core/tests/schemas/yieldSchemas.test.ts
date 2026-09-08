import { dailyYieldReturnsResponseSchema } from '@core/schemas/api/analytics/yieldSchemas';
import { describe, expect, it } from 'vitest';

const legacyPayload = {
  user_id: 'user-123',
  period: {
    start_date: '2026-01-01T00:00:00+00:00',
    end_date: '2026-01-02T00:00:00+00:00',
    days: 2,
  },
  daily_returns: [
    {
      date: '2026-01-02',
      protocol_name: 'Aave',
      chain: 'ethereum',
      yield_return_usd: 12.5,
      tokens: [],
    },
  ],
};

describe('dailyYieldReturnsResponseSchema', () => {
  it('parses a backend that has not shipped attribution yet', () => {
    // The frontend rolls out ahead of the backend, so the added fields must
    // default rather than reject the whole response.
    const parsed = dailyYieldReturnsResponseSchema.parse(legacyPayload);

    expect(parsed.daily_returns[0]?.outlier).toBe(false);
    expect(parsed.wallet_returns).toEqual([]);
  });

  it('keeps the attribution fields the backend now sends', () => {
    const parsed = dailyYieldReturnsResponseSchema.parse({
      ...legacyPayload,
      daily_returns: [{ ...legacyPayload.daily_returns[0], outlier: true }],
      wallet_returns: [
        {
          date: '2026-01-02',
          tokens: [
            {
              symbol: 'ETH',
              amount_change: 0,
              current_price: 3_100,
              yield_return_usd: 0,
              market_return_usd: 200,
            },
          ],
        },
      ],
    });

    expect(parsed.daily_returns[0]?.outlier).toBe(true);
    expect(parsed.wallet_returns[0]?.tokens[0]?.market_return_usd).toBe(200);
  });
});
