import type {
  BacktestResponse,
  BacktestTimelinePoint,
} from '@zapengine/app-core/types/backtesting';
import { useMemo } from 'react';

import {
  type BacktestChartPoint,
  buildChartPoint,
  calculateActualDays,
  calculateYAxisDomain,
  filterToActiveStrategies,
  sortStrategyIds,
} from '../utils/chartHelpers';

export interface UseBacktestResultReturn {
  chartData: BacktestChartPoint[];
  chartDataIndex: Map<string, BacktestTimelinePoint>;
  yAxisDomain: [number, number];
  summary: { strategies: BacktestResponse['strategies'] } | null;
  sortedStrategyIds: string[];
  actualDays: number;
}

export function useBacktestResult(
  response: BacktestResponse | null,
): UseBacktestResultReturn {
  const actualDays = useMemo(
    () => (response ? calculateActualDays(response.timeline) : 0),
    [response],
  );

  const sortedStrategyIds = useMemo(
    () =>
      response
        ? filterToActiveStrategies(
            sortStrategyIds(Object.keys(response.strategies ?? {})),
          )
        : [],
    [response],
  );

  const { chartData, chartDataIndex } = useMemo(() => {
    if (!response) {
      return { chartData: [], chartDataIndex: new Map() };
    }

    const index = new Map<string, BacktestTimelinePoint>();
    const total = response.timeline.length;
    const data = response.timeline.map((point, pointIndex) => {
      index.set(point.market.date, point);
      return buildChartPoint(point, sortedStrategyIds, {
        pointIndex,
        totalPoints: total,
      });
    });

    return { chartData: data, chartDataIndex: index };
  }, [response, sortedStrategyIds]);

  const summary = response ? { strategies: response.strategies } : null;

  const yAxisDomain = useMemo(
    () => calculateYAxisDomain(chartData, sortedStrategyIds),
    [chartData, sortedStrategyIds],
  );

  return {
    chartData,
    chartDataIndex,
    yAxisDomain,
    summary,
    sortedStrategyIds,
    actualDays,
  };
}
