import { httpUtils } from '@/lib/http';
import { createApiServiceCaller } from '@/lib/http/createServiceCaller';
import {
  MAX_CHART_POINTS,
  MIN_CHART_POINTS,
  sampleTimelineData,
} from '@/services/backtestingTimeline';
import type {
  BacktestRequest,
  BacktestResponse,
  BacktestStrategyCatalogResponseV3,
} from '@/types/backtesting';

const callBacktestingApi = createApiServiceCaller(
  {
    400: 'Invalid backtest parameters. Please review your inputs and try again.',
    404: 'Backtest endpoint not found. Please verify analytics-engine is running.',
    500: 'An unexpected error occurred while running the backtest.',
    503: 'Backtest service is temporarily unavailable. Please try again later.',
    504: 'Backtest request timed out. Please try again.',
  },
  'Failed to run backtest',
);

/** @internal — test-only re-exports */
export { sampleTimelineData as _sampleTimelineData };
export { MAX_CHART_POINTS, MIN_CHART_POINTS };

export async function getBacktestingStrategiesV3(): Promise<BacktestStrategyCatalogResponseV3> {
  return callBacktestingApi(() =>
    httpUtils.analyticsEngine.get<BacktestStrategyCatalogResponseV3>(
      '/api/v3/backtesting/strategies',
    ),
  );
}

export async function runBacktest(
  request: BacktestRequest,
): Promise<BacktestResponse> {
  const response = await callBacktestingApi(() =>
    httpUtils.analyticsEngine.post<BacktestResponse>(
      '/api/v3/backtesting/compare',
      request,
      {
        timeout: 600000, // 10 minutes (20x default timeout for complex backtests)
      },
    ),
  );

  // Sample timeline data to reduce memory usage while preserving signals
  return {
    ...response,
    timeline: sampleTimelineData(response.timeline),
  };
}
