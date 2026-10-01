import type { ReactElement } from 'react';
import type { MetricTone } from '@/integration/portfolioTypes';
import { Card } from './Card';
import { Stat } from './Stat';
import { SkeletonBlock } from './Skeleton';
import { Columns } from './Columns';
interface StatGridProps {
  metrics?: { id?: string; label: string; value: string; tone: MetricTone }[];
  loading?: boolean;
  count?: number;
  className?: string;
}
export function StatGrid({
  metrics = [],
  loading = false,
  count = 4,
  className,
}: StatGridProps): ReactElement {
  const total = loading ? count : metrics.length;
  return (
    <Columns minColumnWidth={144} {...(className ? { className } : {})}>
      {Array.from({ length: total }, (_, index) => {
        const metric = metrics[index];
        return (
          <Card key={metric?.id ?? metric?.label ?? index} padding="sm">
            {loading || !metric ? (
              <>
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="mt-2 h-6 w-16" />
              </>
            ) : (
              <Stat {...metric} />
            )}
          </Card>
        );
      })}
    </Columns>
  );
}
