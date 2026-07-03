import { View } from 'react-native';

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
    <View className={cn('-m-1 flex-row flex-wrap', className)}>
      {items.map((item) => (
        <View key={item} className="w-1/2 p-1">
          <View
            className="rounded-2xl border border-line p-[13px]"
            style={{ backgroundColor: 'rgba(255,255,255,.025)' }}
          >
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="mt-2 h-6 w-16" />
          </View>
        </View>
      ))}
    </View>
  );
}
