/**
 * DailyYieldTooltip - Daily yield with protocol breakdown
 */

import type { DailyYieldHoverData } from "@/types/ui/chartHover";
import { formatters } from "@/utils/formatters";

import { TooltipRow } from "./TooltipRow";
import { TooltipWrapper } from "./TooltipWrapper";

export function DailyYieldTooltip({ data }: { data: DailyYieldHoverData }) {
  const isPositive = data.totalYield >= 0;
  const colorClass = isPositive ? "text-emerald-400" : "text-red-400";

  const sortedProtocols =
    data.protocols
      ?.slice()
      .sort(
        (a, b) => Math.abs(b.yield_return_usd) - Math.abs(a.yield_return_usd)
      ) ?? [];

  return (
    <TooltipWrapper date={data.date}>
      <TooltipRow
        label="Daily Yield"
        labelColor="text-gray-300"
        value={data.totalYield}
        valueColor={colorClass}
        format="currency"
        prefix={isPositive ? "+" : ""}
      />
      {data.cumulativeYield !== undefined && (
        <TooltipRow
          label="Cumulative"
          labelColor="text-purple-300"
          value={data.cumulativeYield}
          format="currency"
        />
      )}
      {sortedProtocols.length > 0 && (
        <div className="border-t border-gray-700 pt-1.5 mt-1.5">
          <div className="text-xs text-gray-400 mb-1">
            By Protocol ({data.protocolCount})
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {sortedProtocols.map((protocol, idx) => {
              const protocolPositive = protocol.yield_return_usd >= 0;
              const protocolColor = protocolPositive
                ? "text-emerald-300"
                : "text-red-300";
              return (
                <div
                  key={`${protocol.protocol_name}-${protocol.chain}-${idx}`}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-xs text-gray-300 truncate">
                    {protocol.protocol_name}
                    <span className="text-gray-500 ml-1">
                      ({protocol.chain})
                    </span>
                  </span>
                  <span className={`text-xs font-semibold ${protocolColor}`}>
                    {protocolPositive ? "+" : ""}
                    {formatters.currency(protocol.yield_return_usd)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </TooltipWrapper>
  );
}
