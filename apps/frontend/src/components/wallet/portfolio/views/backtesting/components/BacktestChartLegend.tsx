import type { ReactElement } from 'react';

import { LegendTitle } from '../../shared/LegendTitle';
import { DCA_CLASSIC_STRATEGY_ID } from '../constants';
import { CHART_SIGNALS, type SignalKey } from '../utils/chartHelpers';
import {
  getStrategyColor,
  getStrategyDisplayName,
} from '../utils/strategyDisplay';

interface BacktestChartLegendProps {
  sortedStrategyIds: string[];
}

interface LegendGroupProps {
  title: string;
  items: LegendItem[];
}

interface LegendItem {
  label: string;
  color: string;
}

const EVENT_LEGEND_KEYS: SignalKey[] = [
  'buy_spot',
  'sell_spot',
  'switch_to_eth',
  'switch_to_btc',
  'switch_to_spy',
];

const EVENT_LEGEND: LegendItem[] = EVENT_LEGEND_KEYS.flatMap((key) => {
  const signal = CHART_SIGNALS.find((config) => config.key === key);
  return signal ? [{ label: signal.name, color: signal.color }] : [];
});

export function BacktestChartLegend({
  sortedStrategyIds,
}: BacktestChartLegendProps): ReactElement {
  const strategyLegend = sortedStrategyIds
    .map((strategyId, index) => ({ strategyId, index }))
    .filter(({ strategyId }) => strategyId !== DCA_CLASSIC_STRATEGY_ID)
    .map(({ strategyId, index }) => ({
      label: getStrategyDisplayName(strategyId),
      color: getStrategyColor(strategyId, index),
    }));

  return (
    <div className="flex flex-wrap items-start gap-4">
      <LegendGroup title="Strategy" items={strategyLegend} />
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
