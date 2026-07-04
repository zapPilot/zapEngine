import { View } from 'react-native';

import { cn } from '@/lib/cn';
import { resolveColor } from '@/lib/colors';

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
    <View
      className={cn('flex-row overflow-hidden rounded-pill', className)}
      style={{ height, gap: 2 }}
    >
      {segments.map((segment, index) => (
        <View
          key={index}
          style={{
            flex: segment.value,
            backgroundColor: resolveColor(segment.color),
          }}
        />
      ))}
    </View>
  );
}
