import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
}

/** The design's pill CTA — gold `primary` or translucent `secondary`. */
export function PrimaryButton({
  children,
  variant = 'primary',
  className,
  type = 'button',
  ...rest
}: PrimaryButtonProps) {
  const isPrimary = variant === 'primary';
  return (
    <button
      type={type}
      className={cn(
        'zp-tap flex w-full items-center justify-center gap-2 rounded-[15px] px-4 py-[15px] text-[15.5px] font-semibold',
        isPrimary ? 'text-[#0a0a0a]' : 'border border-line text-ink',
        className,
      )}
      style={
        isPrimary
          ? { background: 'var(--accent)' }
          : { background: 'rgba(255,255,255,.05)' }
      }
      {...rest}
    >
      {children}
    </button>
  );
}
