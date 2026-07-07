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
 */
export function AllocationBar({
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
}
