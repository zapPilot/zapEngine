/**
 * Data Freshness Indicator Component
 *
 * Displays when portfolio data was last updated with visual state indicators.
 * Responsive: icon-only on mobile, full badge on desktop.
 *
 * States:
 * - Fresh (<24h): Purple-blue gradient with Clock icon
 * - Stale (24-72h): Amber with AlertTriangle icon
 * - Very stale (>72h): Red with AlertCircle icon + pulse animation
 * - Unknown: Gray with Info icon
 */

import { AlertCircle, AlertTriangle, Clock, Info } from "lucide-react";
import { memo, type ReactElement } from "react";

import { calculateDataFreshness } from "@/utils/formatters";

interface DataFreshnessIndicatorProps {
  /** ISO date string from API (YYYY-MM-DD) */
  lastUpdated: string | null | undefined;
  /** Show full badge or icon-only on mobile (default: responsive) */
  variant?: "responsive" | "full" | "icon-only" | "text-only";
  /** Size variant */
  size?: "sm" | "md";
  /** Additional CSS classes */
  className?: string;
}

const FRESHNESS_STYLES = {
  fresh: {
    container:
      "bg-gradient-to-r from-purple-500/20 to-blue-500/20 border-purple-500/30",
    text: "text-purple-300",
    icon: "text-purple-400",
    Icon: Clock,
  },
  stale: {
    container: "bg-amber-500/20 border-amber-500/30",
    text: "text-amber-300",
    icon: "text-amber-400",
    Icon: AlertTriangle,
  },
  "very-stale": {
    container: "bg-red-500/20 border-red-500/30 animate-pulse",
    text: "text-red-300",
    icon: "text-red-400",
    Icon: AlertCircle,
  },
  unknown: {
    container: "bg-gray-500/20 border-gray-500/30",
    text: "text-gray-400",
    icon: "text-gray-500",
    Icon: Info,
  },
} as const;

const SIZE_STYLES = {
  sm: {
    container: "px-2 py-1 text-xs gap-1",
    icon: "w-3 h-3",
  },
  md: {
    container: "px-3 py-1.5 text-sm gap-2",
    icon: "w-4 h-4",
  },
} as const;

function getTextClasses(
  variant: DataFreshnessIndicatorProps["variant"]
): string {
  if (variant === "icon-only") {
    return "sr-only";
  }

  if (variant === "responsive") {
    return "hidden md:inline";
  }

  return "";
}

function DataFreshnessIndicatorComponent({
  lastUpdated,
  variant = "responsive",
  size = "sm",
  className = "",
}: DataFreshnessIndicatorProps): ReactElement {
  const freshness = calculateDataFreshness(lastUpdated);
  const styles = FRESHNESS_STYLES[freshness.state];
  const sizeStyles = SIZE_STYLES[size];
  const Icon = styles.Icon;

  const isTextOnly = variant === "text-only";
  const baseClasses = `
    inline-flex items-center rounded-full
    ${isTextOnly ? "" : "border"}
    ${isTextOnly ? "" : styles.container}
    ${sizeStyles.container}
    ${className}
  `;

  const textClasses = getTextClasses(variant);

  return (
    <div
      className={baseClasses}
      title={`Data updated ${freshness.relativeTime} (${freshness.timestamp})`}
      role="status"
      aria-live="polite"
    >
      <Icon
        className={`${sizeStyles.icon} ${styles.icon} flex-shrink-0`}
        aria-hidden="true"
      />
      <span className={`${styles.text} font-medium ${textClasses}`}>
        Updated {freshness.relativeTime}
      </span>
    </div>
  );
}

export const DataFreshnessIndicator = memo(DataFreshnessIndicatorComponent);

DataFreshnessIndicator.displayName = "DataFreshnessIndicator";
