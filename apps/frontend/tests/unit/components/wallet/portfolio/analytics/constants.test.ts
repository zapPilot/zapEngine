import { describe, expect, it } from 'vitest';

import {
  ANALYTICS_TIME_PERIODS,
  DEFAULT_ANALYTICS_PERIOD,
} from '@/components/wallet/portfolio/analytics/constants';

describe('ANALYTICS_TIME_PERIODS', () => {
  it('exports an array with 5 periods', () => {
    expect(ANALYTICS_TIME_PERIODS).toHaveLength(5);
  });

  it('contains the expected period keys in order', () => {
    const keys = ANALYTICS_TIME_PERIODS.map((p) => p.key);
    expect(keys).toEqual(['1M', '3M', '6M', '1Y', 'ALL']);
  });

  it('every period has a positive days value', () => {
    for (const period of ANALYTICS_TIME_PERIODS) {
      expect(period.days).toBeGreaterThan(0);
    }
  });

  it('has correct days mapping for each period', () => {
    const daysMap: Record<string, number> = {
      '1M': 30,
      '3M': 90,
      '6M': 180,
      '1Y': 365,
      ALL: 730,
    };

    for (const period of ANALYTICS_TIME_PERIODS) {
      expect(period.days).toBe(daysMap[period.key]);
    }
  });

  it('label matches key for each period', () => {
    for (const period of ANALYTICS_TIME_PERIODS) {
      expect(period.label).toBe(period.key);
    }
  });
});

describe('DEFAULT_ANALYTICS_PERIOD', () => {
  it('defaults to the 1Y period', () => {
    expect(DEFAULT_ANALYTICS_PERIOD.key).toBe('1Y');
    expect(DEFAULT_ANALYTICS_PERIOD.days).toBe(365);
    expect(DEFAULT_ANALYTICS_PERIOD.label).toBe('1Y');
  });

  it('is one of the periods in ANALYTICS_TIME_PERIODS', () => {
    const found = ANALYTICS_TIME_PERIODS.find(
      (p) => p.key === DEFAULT_ANALYTICS_PERIOD.key,
    );
    expect(found).toBeDefined();
  });
});
