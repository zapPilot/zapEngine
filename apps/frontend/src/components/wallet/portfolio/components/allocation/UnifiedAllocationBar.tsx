import { motion } from "framer-motion";

import { getBarStyle } from "@/constants/assets";
import { cn } from "@/lib/ui/classNames";

import { AllocationLegend } from "./AllocationLegend";
import type {
  UnifiedAllocationBarProps,
  UnifiedSegment,
} from "./unifiedAllocationTypes";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Default minimum percentage to show inline label */
const DEFAULT_LABEL_THRESHOLD = 10;

/** Size variants for the bar height */
const SIZE_CLASSES = {
  sm: "h-3", // 12px - compact (tooltips)
  md: "h-5", // 20px - standard (dashboard, strategy)
  lg: "h-8", // 32px - large (hero sections)
} as const;

/** Text size variants based on bar size */
const LABEL_TEXT_CLASSES = {
  sm: "text-[8px]",
  md: "text-[10px]",
  lg: "text-xs",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const STYLES = {
  container: "flex flex-col gap-1",
  barWrapper:
    "relative w-full rounded-lg overflow-hidden flex bg-gray-800/50 ring-1 ring-white/5",
  segment:
    "relative flex items-center justify-center transition-all duration-300",
  segmentLabel: "font-medium text-white whitespace-nowrap px-1",
  title: "text-[10px] text-gray-500 font-medium mb-1",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Segment Component
// ─────────────────────────────────────────────────────────────────────────────

interface SegmentProps {
  segment: UnifiedSegment;
  showLabel: boolean;
  labelThreshold: number;
  size: "sm" | "md" | "lg";
  testIdPrefix: string | undefined;
}

function Segment({
  segment,
  showLabel,
  labelThreshold,
  size,
  testIdPrefix,
}: SegmentProps) {
  const canShowLabel = showLabel && segment.percentage >= labelThreshold;
  const testId = testIdPrefix
    ? `${testIdPrefix}-${segment.category}`
    : `unified-segment-${segment.category}`;

  return (
    <motion.div
      data-testid={testId}
      className={cn(STYLES.segment, SIZE_CLASSES[size])}
      style={{
        width: `${Math.max(segment.percentage, 0.5)}%`, // Min width for visibility
        ...getBarStyle(segment.color),
      }}
      whileHover={{ scale: 1.02, y: -1 }}
      transition={{ duration: 0.15 }}
      title={`${segment.label}: ${segment.percentage.toFixed(1)}%`}
    >
      {canShowLabel && (
        <span className={cn(STYLES.segmentLabel, LABEL_TEXT_CLASSES[size])}>
          {segment.label} {segment.percentage.toFixed(0)}%
        </span>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * UnifiedAllocationBar - A reusable allocation visualization component.
 *
 * Displays portfolio allocation across 4 categories: BTC, BTC-STABLE, STABLE, ALT.
 * Supports multiple sizes, optional legend, and inline labels for large segments.
 *
 * @example
 * ```tsx
 * // Basic usage with segments from mapPortfolioToUnified
 * <UnifiedAllocationBar segments={segments} />
 *
 * // Compact mode for tooltips
 * <UnifiedAllocationBar segments={segments} size="sm" showLegend={false} />
 *
 * // With custom title
 * <UnifiedAllocationBar segments={segments} title="Current Allocation" />
 * ```
 */
export function UnifiedAllocationBar({
  segments,
  showLegend = true,
  showLabels = true,
  labelThreshold = DEFAULT_LABEL_THRESHOLD,
  size = "md",
  className,
  title,
  testIdPrefix,
}: UnifiedAllocationBarProps) {
  const legendItems = segments.map(s => ({
    symbol: s.category,
    label: s.label,
    percentage: s.percentage,
    color: s.color,
  }));

  // Don't render if no segments
  if (segments.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(STYLES.container, className)}
      data-testid={
        testIdPrefix ? `${testIdPrefix}-container` : "unified-allocation-bar"
      }
    >
      {title && <div className={STYLES.title}>{title}</div>}

      <div className={cn(STYLES.barWrapper, SIZE_CLASSES[size])}>
        {segments.map(segment => (
          <Segment
            key={segment.category}
            segment={segment}
            showLabel={showLabels}
            labelThreshold={labelThreshold}
            size={size}
            testIdPrefix={testIdPrefix}
          />
        ))}
      </div>

      {showLegend && <AllocationLegend items={legendItems} />}
    </div>
  );
}
