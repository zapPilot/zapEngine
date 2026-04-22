import type { ReactElement } from 'react';
import { Area, Line, Scatter } from 'recharts';

import { DCA_CLASSIC_STRATEGY_ID } from '../constants';
import { CHART_SIGNALS } from '../utils/chartHelpers';
import {
  getStrategyColor,
  getStrategyDisplayName,
} from '../utils/strategyDisplay';
import {
  getStrategyVisualTier,
  getStrokeDasharrayProps,
} from './backtestChartHelpers';
import type { IndicatorKey } from './backtestChartLegendData';

interface ChartDefsProps {
  strategyIds: string[];
  prefix: string;
}

interface StrategyAreaProps {
  strategyId: string;
  index: number;
  isPrimary: boolean;
  prefix: string;
}

export function renderIndicatorLayers(
  activeIndicators: Set<IndicatorKey>,
): ReactElement[] {
  const layers: ReactElement[] = [];

  if (activeIndicators.has('sentiment')) {
    layers.push(
      <Line
        key="indicator-sentiment"
        yAxisId="sentimentRight"
        type="monotone"
        dataKey="sentiment"
        name="Sentiment"
        stroke="#a855f7"
        strokeWidth={1}
        dot={false}
        connectNulls={true}
        strokeOpacity={0.4}
        legendType="none"
      />,
    );
  }

  if (activeIndicators.has('btcPrice')) {
    layers.push(
      <Line
        key="indicator-btc-price"
        yAxisId="priceRight"
        type="monotone"
        dataKey="btc_price"
        name="BTC Price"
        stroke="#3b82f6"
        strokeWidth={1.5}
        dot={false}
        connectNulls={true}
        legendType="none"
      />,
    );
  }

  if (activeIndicators.has('dma200')) {
    layers.push(
      <Line
        key="indicator-dma200"
        yAxisId="priceRight"
        type="monotone"
        dataKey="dma_200"
        name="DMA 200"
        stroke="#f59e0b"
        strokeWidth={1.25}
        strokeDasharray="5 3"
        dot={false}
        connectNulls={true}
        legendType="none"
      />,
    );
  }

  return layers;
}

export function ChartDefs({
  prefix,
  strategyIds,
}: ChartDefsProps): ReactElement {
  return (
    <defs>
      {strategyIds.map((strategyId, index) => {
        const color = getStrategyColor(strategyId, index);
        return (
          <linearGradient
            key={`gradient-${strategyId}`}
            id={`${prefix}-color-${strategyId}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        );
      })}
    </defs>
  );
}

export function StrategyArea({
  index,
  isPrimary,
  prefix,
  strategyId,
}: StrategyAreaProps): ReactElement {
  const color = getStrategyColor(strategyId, index);
  const displayName = getStrategyDisplayName(strategyId);
  const isDcaClassic = strategyId === DCA_CLASSIC_STRATEGY_ID;
  const strokeDasharrayProps = getStrokeDasharrayProps(isDcaClassic);
  const { strokeWidth, strokeOpacity } = getStrategyVisualTier(index);

  return (
    <Area
      type="monotone"
      dataKey={`${strategyId}_value`}
      name={displayName}
      stroke={color}
      strokeOpacity={strokeOpacity}
      fillOpacity={isPrimary ? 1 : 0}
      fill={isPrimary ? `url(#${prefix}-color-${strategyId})` : 'transparent'}
      strokeWidth={strokeWidth}
      {...strokeDasharrayProps}
    />
  );
}

export function renderSignalScatterLayers(): ReactElement[] {
  return CHART_SIGNALS.map((signal) => (
    <Scatter
      key={signal.key}
      name={signal.name}
      dataKey={signal.field}
      fill={signal.color}
      shape={signal.shape}
      legendType="none"
    />
  ));
}
