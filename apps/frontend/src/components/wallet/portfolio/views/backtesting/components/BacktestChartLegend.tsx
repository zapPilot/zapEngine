import type { ReactElement } from 'react';

import { LegendTitle } from '../../shared/LegendTitle';
import { PillToggleGroup } from '../../shared/PillToggleGroup';
import {
  getStrategyColor,
  getStrategyDisplayName,
} from '../utils/strategyDisplay';
import {
  EVENT_LEGEND,
  INDICATOR_LEGEND,
  type IndicatorKey,
  type LegendItem,
} from './backtestChartLegendData';

interface BacktestChartLegendProps {
  sortedStrategyIds: string[];
  activeIndicators: ReadonlySet<IndicatorKey>;
  onToggleIndicator: (key: IndicatorKey) => void;
}

interface LegendGroupProps {
  title: string;
  items: LegendItem[];
}

export function BacktestChartLegend({
  sortedStrategyIds,
  activeIndicators,
  onToggleIndicator,
}: BacktestChartLegendProps): ReactElement {
  const strategyLegend = sortedStrategyIds.map((strategyId, index) => ({
    label: getStrategyDisplayName(strategyId),
    color: getStrategyColor(strategyId, index),
  }));

  const indicatorItems = INDICATOR_LEGEND.map((item) => ({
    key: item.key,
    label: item.label,
    color: item.color,
  }));

  return (
    <div className="flex flex-wrap items-start gap-4">
      <LegendGroup title="Strategy" items={strategyLegend} />
      <PillToggleGroup
        title="Market Context"
        items={indicatorItems}
        activeKeys={activeIndicators}
        onToggle={onToggleIndicator}
      />
      <LegendGroup title="Events" items={EVENT_LEGEND} />
    </div>
  );
}

function LegendGroup({ title, items }: LegendGroupProps): ReactElement | null {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="min-w-[120px]">
      <LegendTitle title={title} />
      <div className="flex flex-wrap gap-2">
        {items.map(({ label, color }) => (
          <div
            key={`${title}-${label}`}
            className="flex items-center gap-1.5 text-[10px] text-gray-400"
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
