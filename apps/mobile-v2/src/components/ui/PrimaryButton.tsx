import { type ReactNode } from 'react';

import { Tap, type TapProps } from '@/components/ui/Tap';
import { wrapTextChildren } from '@/components/ui/textChildren';
import { cn } from '@/lib/cn';

interface PrimaryButtonProps extends Omit<TapProps, 'children'> {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
}

/** The design's pill CTA — gold `primary` or translucent `secondary`. */
export function PrimaryButton({
  children,
  variant = 'primary',
  className,
  disabled,
  ...rest
}: PrimaryButtonProps) {
  const isPrimary = variant === 'primary';
  const labelClassName = cn(
    'text-[15.5px] font-sans-semibold',
    isPrimary ? 'text-[#0a0a0a]' : 'text-ink',
  );
  return (
    <Tap
      className={cn(
        'w-full flex-row items-center justify-center gap-2 rounded-[15px] px-4 py-[15px]',
        isPrimary
          ? 'bg-accent'
          : 'border border-line bg-[rgba(255,255,255,.05)]',
        disabled && 'opacity-45',
        className,
      )}
      disabled={disabled}
      {...rest}
    >
      {/* RN text does not inherit from the container — wrap bare strings. */}
      {wrapTextChildren(children, labelClassName)}
    </Tap>
  );
}
