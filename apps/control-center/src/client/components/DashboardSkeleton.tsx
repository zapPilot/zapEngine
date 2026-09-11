import type { DashboardView } from './AppShell.js';
import { SkeletonBlock, SkeletonRows } from './ui/Skeleton.js';

const CARD_COUNTS: Record<DashboardView, number> = {
  economics: 4,
  growth: 4,
  home: 6,
  pipeline: 3,
  product: 4,
  reliability: 4,
};

export function DashboardSkeleton(props: { view: DashboardView }) {
  const count = CARD_COUNTS[props.view];
  const metricHeavy = props.view === 'reliability';

  return (
    <div
      aria-busy="true"
      aria-label="Loading dashboard data"
      className={`cc-stack dashboard-skeleton dashboard-skeleton-${props.view}`}
      role="status"
    >
      {metricHeavy ? (
        <div aria-hidden="true" className="dashboard-skeleton-metrics">
          {Array.from({ length: 4 }, (_, index) => (
            <SkeletonCard compact key={index} />
          ))}
        </div>
      ) : (
        <SkeletonCard large />
      )}

      <div
        aria-hidden="true"
        className={`dashboard-skeleton-grid ${count <= 4 ? 'dashboard-skeleton-grid-2' : ''}`}
      >
        {Array.from(
          { length: metricHeavy ? count - 2 : count - 1 },
          (_, index) => (
            <SkeletonCard key={index} />
          ),
        )}
      </div>
    </div>
  );
}

function SkeletonCard(props: { compact?: boolean; large?: boolean }) {
  return (
    <section
      className={[
        'cc-skeleton-card',
        props.compact ? 'cc-skeleton-card-compact' : '',
        props.large ? 'cc-skeleton-card-large' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <SkeletonBlock className="cc-skeleton-heading" />
      <SkeletonBlock className="cc-skeleton-subheading" />
      <SkeletonBlock className="cc-skeleton-metric" />
      <SkeletonRows rows={props.compact ? 2 : 3} />
    </section>
  );
}
