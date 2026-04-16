import {
  TerminalDropdown,
  type TerminalDropdownOption,
} from "./TerminalDropdown";
import { phosphorGlowStyle } from "./terminalStyles";

export interface BacktestCommandBarProps {
  /** Current days value for the input */
  days: number;
  /** Called when the user changes the days input */
  onDaysChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Strategy options for the dropdown */
  strategyOptions: TerminalDropdownOption[];
  /** Currently selected strategy ID */
  selectedStrategyId: string;
  /** Called when the user selects a different strategy */
  onStrategyChange: (strategyId: string) => void;
  /** Pacing engine identifier (static label) */
  pacingEngineId: string;
  /** Whether a backtest is currently running */
  isPending: boolean;
  /** Trigger a new backtest run */
  onRun: () => void;
}

/**
 * Terminal-styled command prompt bar with days input, strategy dropdown,
 * pacing label, and [RUN] button.
 *
 * @param props - {@link BacktestCommandBarProps}
 * @returns The command bar row
 *
 * @example
 * ```tsx
 * <BacktestCommandBar
 *   days={500}
 *   onDaysChange={handleDaysChange}
 *   strategyOptions={options}
 *   selectedStrategyId="dma_gated_fgi"
 *   onStrategyChange={handleStrategyChange}
 *   pacingEngineId="fgi_exponential"
 *   isPending={false}
 *   onRun={handleRun}
 * />
 * ```
 */
export function BacktestCommandBar({
  days,
  onDaysChange,
  strategyOptions,
  selectedStrategyId,
  onStrategyChange,
  pacingEngineId,
  isPending,
  onRun,
}: BacktestCommandBarProps): React.ReactElement {
  const hasMultipleStrategies = strategyOptions.length > 1;

  return (
    <div className="border-b border-gray-800 px-4 py-3 flex items-center gap-2 flex-wrap">
      <span className="text-emerald-400" style={phosphorGlowStyle}>
        $
      </span>
      <span className="text-gray-300">backtest</span>

      <span className="text-gray-400">--days</span>
      <input
        type="number"
        value={days}
        onChange={onDaysChange}
        className="bg-transparent border-b border-emerald-400/30 text-emerald-400 w-16 text-center focus:outline-none"
        style={phosphorGlowStyle}
      />

      <span className="text-gray-400">--strategy</span>
      {hasMultipleStrategies ? (
        <TerminalDropdown
          options={strategyOptions}
          value={selectedStrategyId}
          onChange={onStrategyChange}
          disabled={isPending}
        />
      ) : (
        <span
          className="border-b border-emerald-400/30 text-emerald-400 px-1"
          style={phosphorGlowStyle}
        >
          {selectedStrategyId}
        </span>
      )}

      <span className="text-gray-400">--pacing</span>
      <span
        className="border-b border-emerald-400/30 text-emerald-400 px-1"
        style={phosphorGlowStyle}
      >
        {pacingEngineId}
      </span>

      <button
        onClick={onRun}
        disabled={isPending}
        className="ml-auto border border-emerald-400/30 text-emerald-400 px-3 py-1 rounded hover:bg-emerald-400/10 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        style={phosphorGlowStyle}
      >
        {isPending ? "[...]" : "[RUN]"}
      </button>
    </div>
  );
}
