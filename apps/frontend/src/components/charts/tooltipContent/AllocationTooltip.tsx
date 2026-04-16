/**
 * AllocationTooltip - Asset allocation breakdown
 */

import { ASSET_CATEGORIES } from "@/constants/portfolio";
import type { AllocationHoverData } from "@/types/ui/chartHover";

import { TooltipRow } from "./TooltipRow";
import { TooltipWrapper } from "./TooltipWrapper";

const ALLOCATION_KEYS = ["btc", "eth", "stablecoin", "altcoin"] as const;

export function AllocationTooltip({ data }: { data: AllocationHoverData }) {
  return (
    <TooltipWrapper date={data.date}>
      {ALLOCATION_KEYS.filter(key => data[key] > 0.5).map(key => (
        <TooltipRow
          key={key}
          label={ASSET_CATEGORIES[key].shortLabel}
          labelColor={ASSET_CATEGORIES[key].tailwindColor}
          value={data[key]}
          format="percent"
        />
      ))}
    </TooltipWrapper>
  );
}
