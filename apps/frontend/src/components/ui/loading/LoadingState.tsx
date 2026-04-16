import type { ReactNode } from "react";

import type { ComponentSize, LoadingVariant } from "@/types/ui/ui.types";

import { Skeleton } from "./Skeleton";
import { CardSkeleton, LoadingCard } from "./skeletons/CardSkeleton";
import { ChartSkeleton } from "./skeletons/ChartSkeleton";
import { MetricsSkeleton } from "./skeletons/MetricsSkeleton";
import { Spinner } from "./Spinner";

interface LoadingStateProps {
  variant?: LoadingVariant;
  size?: ComponentSize;
  message?: string;
  className?: string;
  skeletonType?: "card" | "metrics" | "chart" | "text";
  lines?: number;
}

type SkeletonType = NonNullable<LoadingStateProps["skeletonType"]>;

function renderSkeletonContent(
  skeletonType: SkeletonType,
  lines: number
): ReactNode {
  switch (skeletonType) {
    case "card":
      return <CardSkeleton />;
    case "metrics":
      return <MetricsSkeleton />;
    case "chart":
      return <ChartSkeleton />;
    case "text":
      return <Skeleton variant="text" lines={lines} />;
    default:
      return null;
  }
}

function renderSpinnerContainer(
  size: ComponentSize,
  className: string,
  message: string
): React.ReactNode {
  return (
    <div className={`flex items-center justify-center p-8 ${className}`}>
      <div className="text-center">
        <Spinner size={size} color="primary" />
        {message && <p className="mt-2 text-sm text-gray-400">{message}</p>}
      </div>
    </div>
  );
}

function renderInlineSpinner(
  size: ComponentSize,
  className: string,
  message: string
): React.ReactNode {
  return (
    <div className={`inline-flex items-center space-x-2 ${className}`}>
      <Spinner size={size} color="primary" />
      {message && <span className="text-sm text-gray-400">{message}</span>}
    </div>
  );
}

export function LoadingState({
  variant = "spinner",
  size = "md",
  message = "Loading...",
  className = "",
  skeletonType = "card",
  lines = 3,
}: LoadingStateProps) {
  switch (variant) {
    case "spinner":
      return renderSpinnerContainer(size, className, message);

    case "card":
      return <LoadingCard message={message} className={className} />;

    case "skeleton":
      return (
        <div className={className}>
          {renderSkeletonContent(skeletonType, lines)}
        </div>
      );

    case "inline":
      return renderInlineSpinner(size, className, message);

    default:
      return (
        <div className={`flex items-center justify-center p-8 ${className}`}>
          <Spinner size={size} color="primary" />
        </div>
      );
  }
}
