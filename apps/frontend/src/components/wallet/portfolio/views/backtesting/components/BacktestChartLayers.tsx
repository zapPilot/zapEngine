import type { ReactElement } from 'react';
import { Area, Scatter } from 'recharts';

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
