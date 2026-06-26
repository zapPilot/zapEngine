import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface CardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** Base glass surface used across the design (subtle border + faint fill). */
export function Card({ children, className, style }: CardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-3xl border border-line',
        className,
      )}
      style={{ background: 'rgba(255,255,255,.025)', ...style }}
    >
      {children}
    </div>
  );
}
