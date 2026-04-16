/**
 * Additional Metrics Grid Component
 *
 * Displays secondary analytics metrics (Sortino, Beta, Volatility, Alpha)
 */

import { Activity } from "lucide-react";
import type { ReactElement } from "react";

import type { KeyMetrics, MetricData } from "@/types/analytics";

import { AnalyticsMetricCard } from "./AnalyticsMetricCard";

/**
 * Additional Metrics Grid Props
 */
interface AdditionalMetricsGridProps {
  metrics: KeyMetrics;
  isLoading?: boolean;
}

interface MetricCardDisplayConfig {
  label: string;
  value: string;
  subValue: string;
  valueColor?: string;
}

function resolveMetricData(
  metric: MetricData | undefined,
  fallbackValue: string,
  fallbackSubValue: string
): MetricData {
  if (!metric) {
    return {
      value: fallbackValue,
      subValue: fallbackSubValue,
      trend: "neutral",
    };
  }

  return metric;
}

function buildAlphaMetricConfig(
  alpha: MetricData | undefined
): MetricCardDisplayConfig {
  const alphaMetric = resolveMetricData(alpha, "N/A", "Excess Return");

  return {
    label: "Alpha",
    value: alphaMetric.value,
    subValue: alphaMetric.subValue,
    ...(alphaMetric.value.startsWith("+")
      ? { valueColor: "text-green-400" }
      : {}),
  };
}

function getMetricDisplayConfig(
  metrics: KeyMetrics
): MetricCardDisplayConfig[] {
  const sortinoMetric = resolveMetricData(
    metrics.sortino,
    "N/A",
    "Coming soon"
  );
  const betaMetric = resolveMetricData(metrics.beta, "N/A", "vs BTC");
  const alphaMetricConfig = buildAlphaMetricConfig(metrics.alpha);

  return [
    {
      label: "Sortino Ratio",
      value: sortinoMetric.value,
      subValue: sortinoMetric.subValue,
    },
    {
      label: "Beta (vs BTC)",
      value: betaMetric.value,
      subValue: betaMetric.subValue,
    },
    {
      label: "Volatility",
      value: metrics.volatility.value,
      subValue: metrics.volatility.subValue,
    },
    alphaMetricConfig,
  ];
}

/**
 * Additional Metrics Grid
 *
 * Displays a 4-column grid of additional analytics metrics.
 */
export function AdditionalMetricsGrid({
  metrics,
  isLoading = false,
}: AdditionalMetricsGridProps): ReactElement {
  const metricDisplayConfigs = getMetricDisplayConfig(metrics);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {metricDisplayConfigs.map(metricConfig => (
        <AnalyticsMetricCard
          key={metricConfig.label}
          icon={Activity}
          label={metricConfig.label}
          value={metricConfig.value}
          subValue={metricConfig.subValue}
          {...(metricConfig.valueColor
            ? { valueColor: metricConfig.valueColor }
            : {})}
          isLoading={isLoading}
        />
      ))}
    </div>
  );
}
