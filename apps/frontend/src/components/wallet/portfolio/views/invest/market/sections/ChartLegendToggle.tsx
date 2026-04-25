import type { ReactElement } from 'react';

import { MARKET_LINES, type MarketLineKey } from './marketDashboardConstants';

interface ChartLegendToggleProps {
  /**
   * Set of currently visible line keys. Typed as `ReadonlySet` so consumers
   * are forced to flip visibility through `onToggle` (giving React a new Set
   * identity to re-render against) rather than mutating in place.
   */
  activeLines: ReadonlySet<MarketLineKey>;
  onToggle: (key: MarketLineKey) => void;
}

/**
 * Pill-style legend that lets the user toggle individual chart series on/off.
 *
 * Pattern adapted from
 * `views/backtesting/components/BacktestChartLegend.tsx`. Kept feature-local
 * because it imports `MARKET_LINES` directly; if a second consumer appears,
 * generalize by accepting a `lines` prop instead.
 */
export function ChartLegendToggle({
  activeLines,
  onToggle,
}: ChartLegendToggleProps): ReactElement {
  return (
    <div className="min-w-[120px]">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
        Lines
      </div>
      <div className="flex flex-wrap gap-1.5">
        {MARKET_LINES.map(({ key, label, color }) => {
          const isActive = activeLines.has(key);

          return (
            <button
              key={key}
              type="button"
              aria-pressed={isActive}
              data-testid={`line-toggle-${key}`}
              onClick={() => onToggle(key)}
              className={`rounded-full text-[10px] px-2 py-0.5 cursor-pointer transition-colors border ${
                isActive
                  ? 'text-gray-200'
                  : 'border-zinc-700 text-gray-500 bg-transparent'
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
