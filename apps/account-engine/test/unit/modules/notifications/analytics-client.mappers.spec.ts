import { describe, expect, it } from 'vitest';

import type { PortfolioResponse } from '../../../../src/modules/notifications/interfaces/portfolio-response.interface';
import { transformToEmailMetrics } from '../../../../src/modules/notifications/analytics-client/mappers';

function portfolio(overrides: Record<string, unknown> = {}): PortfolioResponse {
  return {
    total_net_usd: 1_250,
    wallet_count: 2,
    last_updated: '2026-09-14T00:00:00.000Z',
    portfolio_roi: {
      recommended_yearly_roi: 12,
      estimated_yearly_pnl_usd: 150,
      recommended_period: 'roi_30d',
      windows: {
        roi_7d: {
          value: 2.5,
          data_points: 7,
          start_balance: 1_000,
          days_spanned: 6,
        },
      },
    },
    ...overrides,
  } as unknown as PortfolioResponse;
}

describe('transformToEmailMetrics', () => {
  it('maps the report and includes a complete weekly return', () => {
    expect(transformToEmailMetrics(portfolio())).toEqual({
      currentBalance: 1_250,
      estimatedYearlyROI: 12,
      estimatedYearlyPnL: 150,
      walletCount: 2,
      recommendedPeriod: 'roi_30d',
      lastUpdated: '2026-09-14T00:00:00.000Z',
      weeklyPnLPercentage: 2.5,
    });
  });

  it('normalizes a null update timestamp and omits an absent weekly window', () => {
    const value = portfolio({
      last_updated: null,
      portfolio_roi: {
        recommended_yearly_roi: 12,
        estimated_yearly_pnl_usd: 150,
        recommended_period: 'roi_30d',
        windows: {},
      },
    });

    expect(transformToEmailMetrics(value)).toEqual(
      expect.objectContaining({ lastUpdated: undefined }),
    );
    expect(transformToEmailMetrics(value)).not.toHaveProperty(
      'weeklyPnLPercentage',
    );
  });

  it.each([
    ['non-finite value', { value: Number.NaN }],
    ['non-finite point count', { data_points: Number.POSITIVE_INFINITY }],
    ['too few points', { data_points: 1 }],
    ['non-finite start balance', { start_balance: Number.NaN }],
    ['non-positive start balance', { start_balance: 0 }],
    ['non-finite duration', { days_spanned: Number.NaN }],
    ['too short a duration', { days_spanned: 5 }],
  ])('omits weekly return for %s', (_label, windowOverride) => {
    const value = portfolio({
      portfolio_roi: {
        recommended_yearly_roi: 12,
        estimated_yearly_pnl_usd: 150,
        recommended_period: 'roi_30d',
        windows: {
          roi_7d: {
            value: 2.5,
            data_points: 7,
            start_balance: 1_000,
            days_spanned: 6,
            ...windowOverride,
          },
        },
      },
    });

    expect(transformToEmailMetrics(value)).not.toHaveProperty(
      'weeklyPnLPercentage',
    );
  });
});
