import type { IndicatorKey } from "./backtestChartLegendData";
import type { BacktestTooltipProps } from "./BacktestTooltip";

export const AXIS_DEFAULTS = {
  tickLine: false,
  axisLine: false,
} as const;

export function axisTick(fill: string): { fontSize: number; fill: string } {
  return { fontSize: 10, fill };
}

export function buildBacktestTooltipProps(params: {
  active: boolean | undefined;
  payload:
    | readonly {
        name?: string;
        value?: number;
        color?: string;
        payload?: Record<string, unknown>;
      }[]
    | undefined;
  label: string | number | undefined;
  sortedStrategyIds: string[];
  activeIndicators: Set<IndicatorKey>;
}): BacktestTooltipProps {
  const { active, payload, label, sortedStrategyIds, activeIndicators } =
    params;
  const tooltipProps: BacktestTooltipProps = {
    sortedStrategyIds,
    activeIndicators,
  };

  if (active !== undefined) {
    tooltipProps.active = active;
  }

  if (payload != null) {
    tooltipProps.payload = Array.from(payload, item => ({ ...item }));
  }

  if (label != null) {
    tooltipProps.label = label;
  }

  return tooltipProps;
}

export function getStrokeDasharrayProps(isDcaClassic: boolean): {
  strokeDasharray?: string;
} {
  if (!isDcaClassic) {
    return {};
  }

  return { strokeDasharray: "4 4" };
}

export function getStrategyVisualTier(index: number): {
  strokeWidth: number;
  strokeOpacity: number;
} {
  if (index === 0) {
    return { strokeWidth: 1.5, strokeOpacity: 0.65 };
  }

  if (index === 1) {
    return { strokeWidth: 2.5, strokeOpacity: 1 };
  }

  return { strokeWidth: 1, strokeOpacity: 0.35 };
}
