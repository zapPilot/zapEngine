import { cn } from '@/lib/cn';

export interface AllocationSegment {
  color: string;
  /** Relative weight or percentage — segments are sized proportionally. */
  value: number;
}

interface AllocationBarProps {
  segments: AllocationSegment[];
  height?: number;
  className?: string;
}

/** Segmented horizontal proportion bar (allocation pillars). */
export function AllocationBar({
  segments,
  height = 8,
  className,
}: AllocationBarProps) {
  return (
    <div
      className={cn('flex overflow-hidden rounded-full', className)}
      style={{ height, gap: 2 }}
    >
      {segments.map((segment, index) => (
        <div
          key={index}
          style={{ flex: segment.value, background: segment.color }}
        />
      ))}
    </div>
  );
}
