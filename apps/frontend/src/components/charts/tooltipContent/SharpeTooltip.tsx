/**
 * SharpeTooltip - Sharpe ratio with color-coded rating
 */

import type { SharpeHoverData } from "@/types/ui/chartHover";
import {
  getSharpeColor,
  getSharpeInterpretation,
} from "@/utils/chartHoverUtils";

import { TooltipRow } from "./TooltipRow";
import { TooltipWrapper } from "./TooltipWrapper";

const INTERPRETATION_COLORS: Record<SharpeHoverData["interpretation"], string> =
  {
    Excellent: "text-green-400",
    Good: "text-lime-400",
    Fair: "text-yellow-400",
    Poor: "text-orange-400",
    "Very Poor": "text-red-400",
  };

export function SharpeTooltip({ data }: { data: SharpeHoverData }) {
  const interpretation = getSharpeInterpretation(
    data.sharpe
  ) as SharpeHoverData["interpretation"];
  const indicatorColor = getSharpeColor(data.sharpe);

  return (
    <TooltipWrapper date={data.date}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: indicatorColor }}
          />
          <span className="text-xs text-gray-300">Sharpe Ratio</span>
        </div>
        <span className="text-sm font-semibold text-white">
          {data.sharpe.toFixed(2)}
        </span>
      </div>
      <TooltipRow
        label="Rating"
        value={interpretation}
        valueColor={INTERPRETATION_COLORS[interpretation]}
      />
    </TooltipWrapper>
  );
}
