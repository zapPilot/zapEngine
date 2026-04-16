import { motion } from "framer-motion";
import type { ReactElement } from "react";

import { type BaseLoadingProps, DATA_TEST_ID_PROP } from "../constants";
import { Skeleton } from "../Skeleton";

interface SkeletonLegendProps {
  rows?: number;
}

function SkeletonLegend({ rows = 4 }: SkeletonLegendProps): ReactElement {
  return (
    <div className="w-full space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center space-x-3">
          <Skeleton variant="circular" width={12} height={12} />
          <Skeleton variant="text" height={16} width="30%" />
          <Skeleton
            variant="text"
            height={16}
            width="20%"
            className="ml-auto"
          />
        </div>
      ))}
    </div>
  );
}

interface CircularSkeletonSectionProps extends BaseLoadingProps {
  size: number;
}

function CircularSkeletonSection({
  size,
  className = "",
  [DATA_TEST_ID_PROP]: testId,
}: CircularSkeletonSectionProps): ReactElement {
  return (
    <motion.div
      className={`flex flex-col items-center space-y-4 ${className}`}
      data-testid={testId}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <Skeleton
        variant="circular"
        width={size}
        height={size}
        className="mb-6"
      />
      <SkeletonLegend />
    </motion.div>
  );
}

interface ChartSkeletonProps extends Pick<BaseLoadingProps, "className"> {
  size?: number;
  [DATA_TEST_ID_PROP]?: string;
}

/**
 * ChartSkeleton - Renders a circular skeleton with a legend, typically used for pie/donut charts.
 * Simplified from the previous factory pattern for better clarity.
 */
export function ChartSkeleton({
  size = 200,
  className = "",
  [DATA_TEST_ID_PROP]: testId = "chart-skeleton",
}: ChartSkeletonProps): ReactElement {
  return (
    <CircularSkeletonSection
      size={size}
      className={className}
      data-testid={testId}
    />
  );
}

ChartSkeleton.displayName = "ChartSkeleton";
