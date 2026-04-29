import type { ReactElement } from 'react';

import { UnifiedAllocationBar } from '@/components/wallet/portfolio/components/allocation';
import type { BacktestPortfolioAllocation } from '@/types/backtesting';

import { buildBacktestAllocationSegments } from '../backtestBuckets';
import { getStrategyColor } from '../utils/strategyDisplay';

export interface BacktestAllocationBarProps {
  displayName: string;
  allocation: BacktestPortfolioAllocation;
  strategyId?: string;
  index?: number | undefined;
}

/**
 * BacktestAllocationBar - Compact allocation bar for backtest tooltip.
 *
 * Uses the unified allocation bar with backtest-specific data mapping.
 * Shows a strategy color indicator without legend or labels for compactness.
 */
export function BacktestAllocationBar({
  displayName,
  allocation,
  strategyId,
  index,
}: BacktestAllocationBarProps): ReactElement | null {
  const segments = buildBacktestAllocationSegments(allocation);

  if (segments.length === 0) {
    return null;
  }

  const strategyColor =
    strategyId != null ? getStrategyColor(strategyId, index) : undefined;

  return (
    <div className="space-y-1">
      {/* Strategy label with optional color indicator */}
      <div className="text-[10px] text-gray-400 font-medium flex items-center gap-1.5">
        {strategyColor != null && (
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: strategyColor }}
          />
        )}
        {displayName}
      </div>

      {/* Unified allocation bar - compact size for tooltip */}
      <UnifiedAllocationBar
        segments={segments}
        size="sm"
        showLegend={false}
        showLabels
        labelThreshold={15}
        testIdPrefix={`backtest-${strategyId ?? 'default'}`}
      />
    </div>
  );
}
