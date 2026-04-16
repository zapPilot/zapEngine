/**
 * DrawdownTooltip - Drawdown with severity and recovery info
 */

import type { DrawdownHoverData } from "@/types/ui/chartHover";
import {
  getDrawdownSeverity,
  getDrawdownSeverityColor,
} from "@/utils/chartHoverUtils";
import { formatters } from "@/utils/formatters";

import { TooltipRow } from "./TooltipRow";
import { TooltipWrapper } from "./TooltipWrapper";

function SeverityBadge({
  severity,
}: {
  severity: "Minor" | "Moderate" | "Significant" | "Severe";
}) {
  const colors = getDrawdownSeverityColor(severity);
  return (
    <span
      className={`text-xs font-semibold px-2 py-0.5 rounded ${colors.bgColor} ${colors.color}`}
    >
      {severity}
    </span>
  );
}

function NewPeakIndicator() {
  return (
    <div className="flex items-center gap-2 mt-1 pt-1.5 border-t border-gray-700">
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        className="text-emerald-400"
      >
        <path
          d="M2 10 L2 2 L10 6 Z"
          fill="currentColor"
          stroke="white"
          strokeWidth="0.5"
        />
      </svg>
      <span className="text-xs text-emerald-400 font-semibold">New Peak</span>
    </div>
  );
}

export function DrawdownTooltip({ data }: { data: DrawdownHoverData }) {
  const severity = getDrawdownSeverity(data.drawdown);

  return (
    <TooltipWrapper date={data.date}>
      <TooltipRow
        label="Drawdown"
        labelColor="text-red-300"
        value={formatters.percent(data.drawdown, 2)}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-gray-400">Severity</span>
        <SeverityBadge severity={severity} />
      </div>
      {data.peakDate && (
        <TooltipRow
          label="Peak Date"
          value={data.peakDate}
          valueColor="text-gray-300"
        />
      )}
      {data.distanceFromPeak != null && (
        <TooltipRow
          label="Days from Peak"
          value={data.distanceFromPeak}
          valueColor="text-blue-400"
        />
      )}
      {data.recoveryDurationDays != null && (
        <TooltipRow
          label="Recovery Time"
          value={`${data.recoveryDurationDays} days`}
          valueColor="text-emerald-400"
        />
      )}
      {data.recoveryDepth != null && (
        <TooltipRow
          label="Cycle Depth"
          value={formatters.percent(data.recoveryDepth, 1)}
          valueColor="text-gray-200"
        />
      )}
      {data.isRecoveryPoint && <NewPeakIndicator />}
    </TooltipWrapper>
  );
}
