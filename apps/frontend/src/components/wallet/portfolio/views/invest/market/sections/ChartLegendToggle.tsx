import type { ReactElement } from 'react';

import { PillToggleGroup } from '../../../shared/PillToggleGroup';
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
 * Uses shared `PillToggleGroup` component (pattern adapted from
 * `views/backtesting/components/BacktestChartLegend.tsx`).
 */
export function ChartLegendToggle({
  activeLines,
  onToggle,
}: ChartLegendToggleProps): ReactElement {
  const items = MARKET_LINES.map((line) => ({
    key: line.key,
    label: line.label,
    color: line.color,
  }));

  return (
    <PillToggleGroup
      title="Lines"
      items={items}
      activeKeys={activeLines}
      onToggle={onToggle}
      testIdPrefix="line-toggle-"
    />
  );
}
