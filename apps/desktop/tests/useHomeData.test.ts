import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HOME_RANGE,
  getHomeDashboardWindowParams,
  resolveHomeAnalyticsSubjectId,
  sliceHomeDailyValuesForRange,
} from '../src/integration/useHomeData';

describe('Home data analytics subject resolution', () => {
  it('prefers account-engine user id and falls back to connected wallet address', () => {
    expect(
      resolveHomeAnalyticsSubjectId(
        'user-123',
        '0x1234567890123456789012345678901234567890',
      ),
    ).toBe('user-123');
    expect(
      resolveHomeAnalyticsSubjectId(
        null,
        '0x1234567890123456789012345678901234567890',
      ),
    ).toBe('0x1234567890123456789012345678901234567890');
    expect(resolveHomeAnalyticsSubjectId(null, null)).toBeNull();
  });
});

describe('Home data historical dashboard window', () => {
  const dailyValues = [
    { date: '2026-05-20T00:00:00', total_value_usd: 100 },
    { date: '2026-06-22T00:00:00', total_value_usd: 200 },
    { date: '2026-06-23T00:00:00', total_value_usd: 210 },
    { date: '2026-06-29T00:00:00', total_value_usd: 220 },
  ];

  it('defaults the Home chart to a historical one-year view', () => {
    expect(DEFAULT_HOME_RANGE).toBe('1Y');
    expect(getHomeDashboardWindowParams()).toEqual({
      trend_days: 365,
      drawdown_days: 365,
      rolling_days: 365,
    });
  });

  it('slices the 365-day dashboard series locally for shorter ranges', () => {
    expect(sliceHomeDailyValuesForRange(dailyValues, '1W')).toEqual([
      dailyValues[1],
      dailyValues[2],
      dailyValues[3],
    ]);
    expect(sliceHomeDailyValuesForRange(dailyValues, '1D')).toEqual([
      dailyValues[2],
      dailyValues[3],
    ]);
    expect(sliceHomeDailyValuesForRange(dailyValues, '1Y')).toEqual(
      dailyValues,
    );
  });
});
