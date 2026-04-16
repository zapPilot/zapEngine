import { ProgressBar } from "@/components/ui/ProgressBar";
import { buildInvestAllocationEntries } from "@/components/wallet/regime/investAllocation";
import type { RegimeAllocationBreakdown } from "@/types/domain/allocation";

interface StrategyAllocationDisplayProps {
  targetAllocation: RegimeAllocationBreakdown;
  hideAllocationTarget?: boolean | undefined;
}

const STYLES = {
  allocationContainer:
    "bg-gray-800/50 rounded-lg p-4 border border-gray-700 mt-4",
} as const;

/**
 * StrategyAllocationDisplay - Visualizes target portfolio allocation
 *
 * Displays progress bars for target allocation across spot and stable buckets.
 *
 * Or shows "Maintain position" message when strategy doesn't change allocation.
 */
export function StrategyAllocationDisplay({
  targetAllocation,
  hideAllocationTarget = false,
}: StrategyAllocationDisplayProps) {
  if (hideAllocationTarget) {
    return (
      <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/30 mt-4 flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <span className="text-blue-200 font-medium">
          Maintain current position
        </span>
      </div>
    );
  }

  return (
    <div className={STYLES.allocationContainer}>
      {buildInvestAllocationEntries(targetAllocation).map((bucket, index) => (
        <ProgressBar
          key={bucket.key}
          label={bucket.progressLabel}
          percentage={bucket.value}
          color={bucket.progressColor}
          className={index < 1 ? "mb-4" : ""}
        />
      ))}
    </div>
  );
}
