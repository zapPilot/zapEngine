import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface InfoRowProps {
  label: ReactNode;
  value: ReactNode;
  className?: string;
  /** Adds a hairline bottom border between stacked rows. */
  divider?: boolean;
}

/** Label-left / value-right summary row (fees, time, settings, …). */
export function InfoRow({ label, value, className, divider }: InfoRowProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between py-[11px]',
        divider && 'border-b border-line',
        className,
      )}
    >
      <span className="text-[12.5px] text-ink-dim">{label}</span>
      <span className="font-mono text-[12.5px] text-ink">{value}</span>
    </div>
  );
}
