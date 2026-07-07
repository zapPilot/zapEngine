import { memo } from 'react';

export interface AllocationSegment {
  color: string;
  /** Relative weight or percentage — segments are sized proportionally. */
  value: number;
}

interface AllocationBarProps {
  segments: AllocationSegment[];
  height?: number;
  className?: string;
  ariaLabel?: string;
}

/**
 * Segmented horizontal proportion bar — web port of the app's
 * `apps/app/src/components/charts/AllocationBar.tsx`. Same geometry
 * (proportional segments, pill radius); widths transition with the shared
 * primary easing so rebalance pulses animate smoothly.
 *
 * Memoized: pass a stable `segments` reference (e.g. via useMemo) to skip
 * re-renders while animation-heavy parents update at 60fps.
 */
export const AllocationBar = memo(function AllocationBar({
  segments,
  height = 8,
  className,
  ariaLabel = 'Allocation breakdown',
}: AllocationBarProps) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;

  return (
    <div
      className={['allocation-bar', className].filter(Boolean).join(' ')}
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
    >
      {segments.map((segment, index) => (
        <span
          key={index}
          className="allocation-bar-segment"
          style={{
            width: `${(segment.value / total) * 100}%`,
            background: segment.color,
          }}
        />
      ))}
    </div>
  );
});
