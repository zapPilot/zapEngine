import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  sampleTimelineData: vi.fn(),
}));

vi.mock('@core/lib/http', () => ({
  httpUtils: {
    analyticsEngine: {
      get: mocks.get,
      post: mocks.post,
    },
  },
}));

vi.mock('@core/lib/http/createServiceCaller', () => ({
  createApiServiceCaller:
    () =>
    async <T>(callback: () => Promise<T>): Promise<T> =>
      callback(),
}));

vi.mock('@core/services/backtestingTimelineService', () => ({
  CHART_POINT_LIMIT: 500,
  sampleTimelineData: (...args: unknown[]) => mocks.sampleTimelineData(...args),
}));

import {
  CHART_POINT_LIMIT,
  getBacktestingStrategiesV3,
  runBacktest,
} from '@core/services/backtestingService';

describe('backtestingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sampleTimelineData.mockImplementation((timeline) => timeline);
  });

  it('fetches the v3 strategy catalog', async () => {
    const catalog = { strategies: [] };
    mocks.get.mockResolvedValue(catalog);
    await expect(getBacktestingStrategiesV3()).resolves.toBe(catalog);
    expect(mocks.get).toHaveBeenCalledWith('/api/v3/backtesting/strategies');
    expect(CHART_POINT_LIMIT).toBe(500);
  });

  it('posts a backtest and samples using the first non-DCA strategy id', async () => {
    const request = { strategy_id: 'alpha' } as never;
    const timeline = [{ date: '2026-01-01' }];
    mocks.post.mockResolvedValue({
      strategies: {
        dca_classic: { label: 'DCA' },
        alpha: { label: 'Alpha' },
        beta: { label: 'Beta' },
      },
      timeline,
      metadata: { ok: true },
    });
    mocks.sampleTimelineData.mockReturnValue([{ sampled: true }]);

    await expect(runBacktest(request)).resolves.toMatchObject({
      timeline: [{ sampled: true }],
      metadata: { ok: true },
    });
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/v3/backtesting/compare',
      request,
      { timeout: 600000 },
    );
    expect(mocks.sampleTimelineData).toHaveBeenCalledWith(timeline, 'alpha');
  });

  it('passes null when only DCA or no strategy map is available', async () => {
    const request = {} as never;
    mocks.post.mockResolvedValueOnce({
      strategies: { dca_classic: {} },
      timeline: [],
    });
    await runBacktest(request);
    expect(mocks.sampleTimelineData).toHaveBeenLastCalledWith([], null);

    mocks.post.mockResolvedValueOnce({ timeline: [] });
    await runBacktest(request);
    expect(mocks.sampleTimelineData).toHaveBeenLastCalledWith([], null);
  });
});
