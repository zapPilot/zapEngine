import { memo, type ReactElement } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { BaseCard } from '@/components/ui/BaseCard';
import type { BacktestTimelinePoint } from '@/types/backtesting';
import { formatChartAxisDate, formatCurrencyAxis } from '@/utils';

import {
  type BacktestChartPoint,
  getPrimaryStrategyId,
} from '../utils/chartHelpers';
import {
  AXIS_DEFAULTS,
  axisTick,
  buildBacktestTooltipProps,
} from './backtestChartHelpers';
import {
  ChartDefs,
  renderSignalScatterLayers,
  StrategyArea,
} from './BacktestChartLayers';
import { BacktestChartLegend } from './BacktestChartLegend';
import { BacktestTooltip, type BacktestTooltipProps } from './BacktestTooltip';

export interface BacktestChartProps {
  chartData: BacktestChartPoint[];
  chartDataIndex: Map<string, BacktestTimelinePoint>;
  sortedStrategyIds: string[];
  yAxisDomain: [number, number];
  actualDays: number;
  /** Unique prefix for gradient IDs when multiple charts exist (e.g. scenario id). */
  chartIdPrefix?: string;
}

export const BacktestChart = memo(function BacktestChart({
  actualDays,
  chartData,
  chartDataIndex,
  chartIdPrefix = 'default',
  sortedStrategyIds,
  yAxisDomain,
}: BacktestChartProps): ReactElement {
  const primarySeriesId = getPrimaryStrategyId(sortedStrategyIds);

  return (
    <BaseCard
      variant="glass"
      className="p-1 h-[500px] relative overflow-visible flex flex-col"
    >
      <div className="p-4 border-b border-gray-800/50 bg-gray-900/30 flex justify-between items-center">
        <div className="text-sm font-medium text-white flex items-center gap-2">
          Portfolio Value Growth
          <span className="text-xs font-normal text-gray-500">
            ({actualDays} Days)
          </span>
        </div>
        <BacktestChartLegend sortedStrategyIds={sortedStrategyIds} />
      </div>

      <div className="flex-1 w-full pt-4 pr-4">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <ChartDefs strategyIds={sortedStrategyIds} prefix={chartIdPrefix} />

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.05)"
              vertical={false}
            />

            <XAxis
              dataKey="date"
              tick={axisTick('#6b7280')}
              {...AXIS_DEFAULTS}
              minTickGap={30}
              tickFormatter={formatChartAxisDate}
            />

            <YAxis
              domain={yAxisDomain}
              tick={axisTick('#6b7280')}
              {...AXIS_DEFAULTS}
              tickFormatter={formatCurrencyAxis}
            />

            <Tooltip
              allowEscapeViewBox={{ x: false, y: true }}
              wrapperStyle={{ zIndex: 20 }}
              content={({ active, payload, label }) => {
                const tooltipProps: BacktestTooltipProps =
                  buildBacktestTooltipProps({
                    active,
                    payload,
                    label,
                    sortedStrategyIds,
                    chartDataIndex,
                  });

                return <BacktestTooltip {...tooltipProps} />;
              }}
            />

            {sortedStrategyIds.map((strategyId, index) => (
              <StrategyArea
                key={strategyId}
                strategyId={strategyId}
                index={index}
                isPrimary={strategyId === primarySeriesId}
                prefix={chartIdPrefix}
              />
            ))}

            {renderSignalScatterLayers()}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </BaseCard>
  );
});
