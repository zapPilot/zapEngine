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
import { useToggleSet } from '@/hooks/ui';
import {
  formatChartAxisDate,
  formatCurrencyAxis,
  formatSentiment,
} from '@/utils';

import { getPrimaryStrategyId } from '../utils/chartHelpers';
import {
  AXIS_DEFAULTS,
  axisTick,
  buildBacktestTooltipProps,
} from './backtestChartHelpers';
import {
  ChartDefs,
  renderIndicatorLayers,
  renderSignalScatterLayers,
  StrategyArea,
} from './BacktestChartLayers';
import { BacktestChartLegend } from './BacktestChartLegend';
import type { IndicatorKey } from './backtestChartLegendData';
import { BacktestTooltip, type BacktestTooltipProps } from './BacktestTooltip';

export interface BacktestChartProps {
  chartData: Record<string, unknown>[];
  sortedStrategyIds: string[];
  yAxisDomain: [number, number];
  actualDays: number;
  /** Unique prefix for gradient IDs when multiple charts exist (e.g. scenario id). */
  chartIdPrefix?: string;
}

export const BacktestChart = memo(function BacktestChart({
  actualDays,
  chartData,
  chartIdPrefix = 'default',
  sortedStrategyIds,
  yAxisDomain,
}: BacktestChartProps): ReactElement {
  const primarySeriesId = getPrimaryStrategyId(sortedStrategyIds);
  const { activeSet: activeIndicators, toggle: handleToggleIndicator } =
    useToggleSet<IndicatorKey>({ initialValue: [] });

  const showPriceAxis =
    activeIndicators.has('btcPrice') || activeIndicators.has('dma200');
  const showSentimentAxis =
    activeIndicators.has('sentiment') || activeIndicators.has('macroFearGreed');

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
        <BacktestChartLegend
          sortedStrategyIds={sortedStrategyIds}
          activeIndicators={activeIndicators}
          onToggleIndicator={handleToggleIndicator}
        />
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

            {showPriceAxis && (
              <YAxis
                yAxisId="priceRight"
                orientation="right"
                tick={axisTick('#f59e0b')}
                {...AXIS_DEFAULTS}
                width={64}
                tickFormatter={formatCurrencyAxis}
                label={{
                  value: 'BTC / DMA 200',
                  angle: 90,
                  position: 'insideRight',
                  style: { fontSize: 10, fill: '#f59e0b' },
                }}
              />
            )}

            {showSentimentAxis && (
              <YAxis
                yAxisId="sentimentRight"
                orientation="right"
                domain={[0, 100]}
                tick={axisTick('#a855f7')}
                {...AXIS_DEFAULTS}
                width={48}
                label={{
                  value: '0-100 Index',
                  angle: 90,
                  position: 'insideRight',
                  style: { fontSize: 10, fill: '#a855f7' },
                }}
                tickFormatter={formatSentiment}
              />
            )}

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
                    activeIndicators: activeIndicators as Set<IndicatorKey>,
                  });

                return <BacktestTooltip {...tooltipProps} />;
              }}
            />

            {renderIndicatorLayers(activeIndicators as Set<IndicatorKey>)}

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
