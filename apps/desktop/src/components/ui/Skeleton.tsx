import type { CSSProperties } from 'react';

import { cn } from '@/lib/cn';

interface SkeletonBlockProps {
  className?: string;
  style?: CSSProperties;
}

/** Brand-aligned shimmer placeholder for desktop loading states. */
export function SkeletonBlock({ className, style }: SkeletonBlockProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block animate-pulse rounded-md bg-white/[0.07]',
        className,
      )}
      style={style}
    />
  );
}
