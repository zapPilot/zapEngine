import { ArrowRight } from "lucide-react";

import {
  mapAssetAllocationToUnified,
  UnifiedAllocationBar,
} from "@/components/wallet/portfolio/components/allocation";
import type { BacktestAssetAllocation } from "@/types/backtesting";

const TARGET_CATEGORIES = ["btc", "eth", "stable"] as const;

interface ImpactVisualProps {
  currentAllocation: BacktestAssetAllocation;
  targetAllocation: BacktestAssetAllocation;
}

export function ImpactVisual({
  currentAllocation,
  targetAllocation,
}: ImpactVisualProps) {
  const currentSegments = mapAssetAllocationToUnified(currentAllocation);
  const targetSegments = mapAssetAllocationToUnified(
    targetAllocation,
    TARGET_CATEGORIES
  );

  return (
    <div className="space-y-4">
      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
        Allocation Impact
      </h4>

      <UnifiedAllocationBar
        segments={currentSegments}
        title="Current"
        size="md"
        showLabels
        labelThreshold={12}
        testIdPrefix="impact-current"
      />

      <div className="flex justify-center opacity-30">
        <ArrowRight className="w-5 h-5 text-gray-400" />
      </div>

      <UnifiedAllocationBar
        segments={targetSegments}
        title="Target"
        size="md"
        showLegend={false}
        showLabels
        labelThreshold={12}
        testIdPrefix="impact-target"
      />
    </div>
  );
}
