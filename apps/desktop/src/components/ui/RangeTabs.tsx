import { cn } from '@/lib/cn';

interface RangeTabsProps {
  options: readonly string[];
  value: string;
  onChange?: (value: string) => void;
  className?: string;
}

/** Segmented time-range selector (1D / 1W / 1M / 1Y / ALL …). */
export function RangeTabs({
  options,
  value,
  onChange,
  className,
}: RangeTabsProps) {
  return (
    <div className={cn('flex gap-1', className)}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange?.(opt)}
            className={cn(
              'zp-tap rounded-full px-[11px] py-[5px] font-mono text-[11px]',
              active ? 'text-accent' : 'text-ink-faint',
            )}
            style={active ? { background: 'var(--accent-soft)' } : undefined}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
