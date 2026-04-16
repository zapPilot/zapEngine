import type { ReactElement } from "react";

import {
  getStrategyColor,
  getStrategyDisplayName,
} from "../utils/strategyDisplay";
import {
  EVENT_LEGEND,
  INDICATOR_LEGEND,
  type IndicatorKey,
  type LegendItem,
} from "./backtestChartLegendData";

interface BacktestChartLegendProps {
  sortedStrategyIds: string[];
  activeIndicators: Set<IndicatorKey>;
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

  return (
    <div className="flex flex-wrap items-start gap-4">
      <LegendGroup title="Strategy" items={strategyLegend} />
      <IndicatorToggleGroup
        activeIndicators={activeIndicators}
        onToggle={onToggleIndicator}
      />
      <LegendGroup title="Events" items={EVENT_LEGEND} />
    </div>
  );
}

interface IndicatorToggleGroupProps {
  activeIndicators: Set<IndicatorKey>;
  onToggle: (key: IndicatorKey) => void;
}

function IndicatorToggleGroup({
  activeIndicators,
  onToggle,
}: IndicatorToggleGroupProps): ReactElement {
  return (
    <div className="min-w-[120px]">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
        Market Context
      </div>
      <div className="flex flex-wrap gap-1.5">
        {INDICATOR_LEGEND.map(({ key, label, color }) => {
          const isActive = activeIndicators.has(key);

          return (
            <button
              key={key}
              type="button"
              aria-pressed={isActive}
              onClick={() => onToggle(key)}
              className={`rounded-full text-[10px] px-2 py-0.5 cursor-pointer transition-colors border ${
                isActive
                  ? "text-gray-200"
                  : "border-zinc-700 text-gray-500 bg-transparent"
              }`}
              style={
                isActive
                  ? {
                      borderColor: color,
                      backgroundColor: `${color}26`,
                    }
                  : undefined
              }
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LegendGroup({ title, items }: LegendGroupProps): ReactElement | null {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="min-w-[120px]">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
        {title}
      </div>
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
