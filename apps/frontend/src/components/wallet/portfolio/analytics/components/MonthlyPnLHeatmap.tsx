/**
 * Monthly PnL Heatmap Component
 *
 * Displays monthly profit/loss as a color-coded heatmap
 */

import { Calendar } from 'lucide-react';
import type { ReactElement } from 'react';

import { BaseCard } from '@/components/ui/BaseCard';
import { MONTH_ABBREVIATIONS as MONTH_LABELS } from '@/constants/dates';

function getMonthlyPnLCellClassName(value: number): string {
  if (value > 0) {
    return 'bg-green-500/20 text-green-300 border border-green-500/20';
  }

  if (value < 0) {
    return 'bg-red-500/20 text-red-300 border border-red-500/20';
  }

  return 'bg-gray-800/50 text-gray-400 border border-gray-700/30';
}

function getMonthlyPnLOpacity(value: number): number {
  if (value > 0) {
    return Math.min(0.4 + value * 0.06, 1);
  }

  if (value < 0) {
    return Math.min(0.4 + Math.abs(value) * 0.1, 1);
  }

  return 0.3;
}

/**
 * Monthly PnL data point
 */
interface MonthlyPnLItem {
  month: string;
  value: number;
}

/**
 * Monthly PnL Heatmap Props
 */
interface MonthlyPnLHeatmapProps {
  monthlyPnL: MonthlyPnLItem[];
  isLoading?: boolean;
}

/**
 * Monthly PnL Heatmap
 *
 * Displays a color-coded grid of monthly profit/loss percentages.
 */
export function MonthlyPnLHeatmap({
  monthlyPnL,
  isLoading = false,
}: MonthlyPnLHeatmapProps): ReactElement {
  let content: ReactElement | ReactElement[];
  if (isLoading) {
    content = MONTH_LABELS.map((month, idx) => (
      <div key={idx} className="flex flex-col gap-1">
        <div
          className="h-12 bg-gray-800/50 rounded-md border border-gray-700/30 animate-pulse"
          aria-hidden="true"
        />
        {/* Real month label */}
        <span className="text-[10px] text-center text-gray-500 font-mono uppercase">
          {month}
        </span>
      </div>
    ));
  } else if (monthlyPnL.length > 0) {
    content = monthlyPnL.map((item, idx) => (
      <div key={idx} className="flex flex-col gap-1">
        <div
          className={`h-12 rounded-md flex items-center justify-center text-xs font-medium transition-transform hover:scale-105 cursor-pointer ${getMonthlyPnLCellClassName(item.value)}`}
          style={{ opacity: getMonthlyPnLOpacity(item.value) }}
        >
          {item.value > 0 ? '+' : ''}
          {item.value.toFixed(1)}%
        </div>
        <span className="text-[10px] text-center text-gray-500 font-mono uppercase">
          {item.month}
        </span>
      </div>
    ));
  } else {
    content = (
      <div className="col-span-12 text-center text-gray-500 py-8">
        No monthly data available for this period
      </div>
    );
  }

  return (
    <BaseCard variant="glass" className="p-6">
      <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-gray-400" />
        Monthly PnL Heatmap
      </h3>
      <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">{content}</div>
    </BaseCard>
  );
}
