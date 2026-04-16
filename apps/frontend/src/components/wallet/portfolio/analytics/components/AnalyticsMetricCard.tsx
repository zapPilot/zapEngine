/**
 * Analytics Metric Card Component
 *
 * Reusable metric card for analytics metrics display
 */

import type { ElementType, ReactElement } from "react";

import { BaseCard } from "@/components/ui/BaseCard";

/**
 * Analytics Metric Card Props
 */
interface AnalyticsMetricCardProps {
  /** Icon component */
  icon: ElementType;
  /** Metric label */
  label: string;
  /** Main value display */
  value: string;
  /** Subtitle/context value */
  subValue: string;
  /** Color class for value (default: text-white) */
  valueColor?: string;
  /** Loading state for skeleton display */
  isLoading?: boolean;
}

/**
 * Reusable metric card for analytics metrics
 *
 * Displays a metric with icon, label, value, and subtitle
 * in a consistent glass-morphism card layout.
 */
export function AnalyticsMetricCard({
  icon: Icon,
  label,
  value,
  subValue,
  valueColor = "text-white",
  isLoading = false,
}: AnalyticsMetricCardProps): ReactElement {
  return (
    <BaseCard variant="glass" className="p-4">
      {/* Real icon and label */}
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      {isLoading ? (
        // Skeleton for value and sub-value
        <>
          <div className="h-6 w-16 bg-gray-700/50 rounded mb-1 animate-pulse" />
          <div className="h-2.5 w-24 bg-gray-800/50 rounded animate-pulse" />
        </>
      ) : (
        <>
          <div className={`text-lg font-mono ${valueColor}`}>{value}</div>
          <div className="text-[10px] text-gray-500">{subValue}</div>
        </>
      )}
    </BaseCard>
  );
}
