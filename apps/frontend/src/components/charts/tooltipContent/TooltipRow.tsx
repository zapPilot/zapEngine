/**
 * TooltipRow - Reusable row component for tooltip content
 */

import type { ReactElement } from "react";

import { formatters } from "@/utils/formatters";

interface TooltipRowProps {
  label: string;
  labelColor?: string;
  value: string | number | undefined;
  valueColor?: string;
  format?: "currency" | "percent" | "text" | "currencyPrecise";
  precision?: number;
  prefix?: string;
}

function formatTooltipValue(
  value: string | number | undefined,
  format: "currency" | "percent" | "text" | "currencyPrecise",
  precision: number
): string {
  if (value === undefined) {
    return "N/A";
  }

  if (typeof value !== "number") {
    return value;
  }

  if (format === "currency") {
    return formatters.currency(value);
  }

  if (format === "currencyPrecise") {
    return formatters.currencyPrecise(value);
  }

  if (format === "percent") {
    return formatters.percent(value, precision);
  }

  return String(value);
}

export function TooltipRow({
  label,
  labelColor = "text-gray-400",
  value,
  valueColor = "text-white",
  format = "text",
  precision = 1,
  prefix = "",
}: TooltipRowProps): ReactElement {
  const formattedValue = formatTooltipValue(value, format, precision);

  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`text-xs ${labelColor}`}>{label}</span>
      <span className={`text-sm font-semibold ${valueColor}`}>
        {prefix}
        {formattedValue}
      </span>
    </div>
  );
}
