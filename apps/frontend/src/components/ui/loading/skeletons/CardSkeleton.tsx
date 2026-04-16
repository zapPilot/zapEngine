import {
  ARIA_LABEL_PROP,
  DATA_TEST_ID_PROP,
  DEFAULT_SKELETON_LABEL,
} from "../constants";
import { Skeleton } from "../Skeleton";

function CardSkeletonContent() {
  return (
    <>
      <Skeleton variant="text" height={24} className="mb-4" width="60%" />
      <Skeleton variant="text" lines={3} spacing="mb-3" />
      <div className="flex space-x-4 mt-6">
        <Skeleton variant="rounded" width={80} height={32} />
        <Skeleton variant="rounded" width={80} height={32} />
      </div>
    </>
  );
}

export function CardSkeleton({
  className = "",
  [DATA_TEST_ID_PROP]: testId = "card-skeleton",
}: {
  className?: string;
  [DATA_TEST_ID_PROP]?: string;
}) {
  return (
    <div className={`p-6 ${className}`} data-testid={testId}>
      <CardSkeletonContent />
    </div>
  );
}

export function LoadingCard({
  message,
  className = "",
  [DATA_TEST_ID_PROP]: testId = "loading-card",
  [ARIA_LABEL_PROP]: ariaLabel,
}: {
  message?: string;
  className?: string;
  [DATA_TEST_ID_PROP]?: string;
  [ARIA_LABEL_PROP]?: string;
}) {
  const finalAriaLabel = ariaLabel ?? message ?? DEFAULT_SKELETON_LABEL;

  return (
    <div
      className={`p-6 ${className}`}
      data-testid={testId}
      role="status"
      aria-label={finalAriaLabel}
    >
      {message && <p className="text-sm text-gray-400 mb-4">{message}</p>}
      <CardSkeletonContent />
    </div>
  );
}
