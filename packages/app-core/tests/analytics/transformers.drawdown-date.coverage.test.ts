import { afterEach, describe, expect, it, vi } from 'vitest';

import { transformToPerformanceChart } from '../../src/lib/analytics/transformers';
import type { UnifiedDashboardResponse } from '../../src/services';

const dashboard = (data: unknown) => data as UnifiedDashboardResponse;

afterEach(() => vi.useRealTimers());

describe('transformToPerformanceChart drawdown fallback coverage', () => {
  it('uses the current timestamp when a finite drawdown portfolio point has no date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T12:00:00Z'));

    const result = transformToPerformanceChart(
      dashboard({
        drawdown_analysis: {
          enhanced: {
            drawdown_data: [{ portfolio_value: 100 }],
          },
        },
      }),
    );

    expect(result.points).toEqual([
      {
        x: 0,
        portfolio: 50,
        date: '2026-09-22T12:00:00.000Z',
        portfolioValue: 100,
      },
    ]);
  });
});
