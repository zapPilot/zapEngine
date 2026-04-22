import { useCallback, useMemo } from 'react';

import type { BacktestResponse } from '@/types/backtesting';
import type { StrategyConfigsResponse } from '@/types/strategy';

import { FIXED_PACING_ENGINE_ID } from '../constants';
import { buildCompareConfigForStrategyId } from '../hooks/backtestConfigurationBuilders';
import { getPrimaryStrategyId } from '../utils/chartHelpers';
import {
  updateConfigStrategy,
  updateJsonField,
} from '../utils/jsonConfigurationHelpers';
import { BacktestChart } from './BacktestChart';
import { BacktestCommandBar } from './BacktestCommandBar';
import { BacktestHeroMetrics } from './BacktestHeroMetrics';
import {
  createHeroMetrics,
  formatTradeFrequency,
} from './backtestTerminalMetrics';
import type { TerminalDropdownOption } from './TerminalDropdown';
import { phosphorGlowDimStyle } from './terminalStyles';

export interface BacktestTerminalDisplayProps {
  /** Strategy summaries keyed by strategy_id */
  summary: { strategies: BacktestResponse['strategies'] } | null;
  /** Strategy IDs in display order */
  sortedStrategyIds: string[];
  /** Actual number of simulated days */
  actualDays: number;
  /** Chart timeline data */
  chartData: Record<string, unknown>[];
  /** Y-axis domain for chart */
  yAxisDomain: [number, number];
  /** Whether a backtest is currently running */
  isPending: boolean;
  /** Trigger a new backtest run */
  onRun: () => void;
  /** Raw JSON editor value (contains days / total_capital) */
  editorValue: string;
  /** Update the JSON editor value */
  onEditorValueChange: (v: string) => void;
  /** Bootstrap payload containing strategies and public presets */
  strategyConfigs: StrategyConfigsResponse | null;
  /** Parsed days value from editor */
  days: number;
  /** Selected strategy ID from editor */
  selectedStrategyId: string;
  /** Strategy options for dropdown */
  strategyOptions: TerminalDropdownOption[];
}

/**
 * Terminal-themed backtesting results display with a retro CLI aesthetic,
 * monospace text, ASCII bars, and a scan-line overlay.
 */
export function BacktestTerminalDisplay({
  summary,
  sortedStrategyIds,
  actualDays,
  chartData,
  yAxisDomain,
  isPending,
  onRun,
  editorValue,
  onEditorValueChange,
  strategyConfigs,
  days,
  selectedStrategyId,
  strategyOptions,
}: BacktestTerminalDisplayProps): React.ReactElement {
  const handleDaysChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onEditorValueChange(
      updateJsonField(editorValue, 'days', Number(e.target.value)),
    );
  };

  const handleStrategyChange = useCallback(
    (newStrategyId: string) => {
      const nextConfig = buildCompareConfigForStrategyId(
        newStrategyId,
        strategyConfigs?.presets ?? [],
        strategyConfigs?.strategies ?? [],
      );
      onEditorValueChange(updateConfigStrategy(editorValue, nextConfig));
    },
    [strategyConfigs, editorValue, onEditorValueChange],
  );

  const primaryId = getPrimaryStrategyId(sortedStrategyIds);
  const regime = primaryId ? summary?.strategies[primaryId] : undefined;

  const heroMetrics = useMemo(() => createHeroMetrics(regime), [regime]);
  const tradeFreqLabel = useMemo(
    () => formatTradeFrequency(regime?.trade_count ?? 0, actualDays),
    [regime?.trade_count, actualDays],
  );

  return (
    <div className="font-mono bg-gray-950 rounded-2xl border border-gray-800 overflow-visible">
      <BacktestCommandBar
        days={days}
        onDaysChange={handleDaysChange}
        strategyOptions={strategyOptions}
        selectedStrategyId={selectedStrategyId}
        onStrategyChange={handleStrategyChange}
        pacingEngineId={FIXED_PACING_ENGINE_ID}
        isPending={isPending}
        onRun={onRun}
      />

      <BacktestHeroMetrics metrics={heroMetrics} />

      {chartData.length > 0 && (
        <div className="relative px-4 py-2">
          <BacktestChart
            chartData={chartData}
            sortedStrategyIds={sortedStrategyIds}
            yAxisDomain={yAxisDomain}
            actualDays={actualDays}
            chartIdPrefix="terminal"
          />
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background:
                'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(52,211,153,0.03) 2px, rgba(52,211,153,0.03) 4px)',
            }}
          />
        </div>
      )}

      {tradeFreqLabel && (
        <div className="px-6 pb-3 -mt-1">
          <span
            className="text-xs text-emerald-400/40 tracking-wide"
            style={phosphorGlowDimStyle}
          >
            {'>'} approx. {tradeFreqLabel}
          </span>
        </div>
      )}
    </div>
  );
}
