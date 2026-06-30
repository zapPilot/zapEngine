import { SkeletonBlock } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';

interface MetricsGridSkeletonProps {
  className?: string;
  count?: number;
}

const DEFAULT_METRIC_COUNT = 4;

/** Two-column metric-card skeleton matching MetricsGrid spacing. */
export function MetricsGridSkeleton({
  className,
  count = DEFAULT_METRIC_COUNT,
}: MetricsGridSkeletonProps) {
  const items = Array.from({ length: count }, (_value, index) => index);

  return (
    <div className={cn('grid grid-cols-2 gap-2', className)}>
      {items.map((item) => (
        <div
          key={item}
          className="rounded-2xl border border-line p-[13px]"
          style={{ background: 'rgba(255,255,255,.025)' }}
        >
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="mt-2 h-6 w-16" />
        </div>
      ))}
    </div>
  );
}
