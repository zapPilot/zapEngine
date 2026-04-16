/**
 * VolatilityTooltip - Volatility with risk assessment
 */

import type { VolatilityHoverData } from "@/types/ui/chartHover";
import {
  calculateDailyVolatility,
  getVolatilityRiskColor,
  getVolatilityRiskLevel,
} from "@/utils/chartHoverUtils";

import { TooltipRow } from "./TooltipRow";
import { TooltipWrapper } from "./TooltipWrapper";

export function VolatilityTooltip({ data }: { data: VolatilityHoverData }) {
  const riskLevel = getVolatilityRiskLevel(data.volatility);
  const riskColors = getVolatilityRiskColor(riskLevel);
  const dailyVol = calculateDailyVolatility(data.volatility);
  const isHighRisk = data.volatility >= 25;

  return (
    <TooltipWrapper date={data.date}>
      <div className="text-sm font-semibold text-white">
        Volatility overview
      </div>
      <TooltipRow
        label="Annualized Vol"
        labelColor="text-amber-300"
        value={data.volatility}
        format="percent"
      />
      <TooltipRow
        label="Daily Vol"
        value={dailyVol}
        format="percent"
        precision={2}
        valueColor="text-gray-300"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-gray-400">Risk Level</span>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded ${riskColors.bgColor} ${riskColors.color}`}
        >
          {riskLevel}
        </span>
      </div>
      {isHighRisk && (
        <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-gray-700">
          <span className="text-xs text-red-400">
            ⚠ High volatility warning
          </span>
        </div>
      )}
    </TooltipWrapper>
  );
}
