import type { MetricTone } from '@/data/mock';
import { cn } from '@/lib/cn';

export interface Metric {
  label: string;
  value: string;
  tone: MetricTone;
}

interface MetricsGridProps {
  metrics: Metric[];
  className?: string;
}

const TONE_CLASS: Record<MetricTone, string> = {
  neutral: 'text-ink',
  positive: 'text-success',
  negative: 'text-error',
  accent: 'text-accent',
};

/** Two-column grid of stat cards (CAGR, Sharpe, returns, …). */
export function MetricsGrid({ metrics, className }: MetricsGridProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-2', className)}>
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="rounded-2xl border border-line p-[13px]"
          style={{ background: 'rgba(255,255,255,.025)' }}
        >
          <div className="font-mono text-[9px] uppercase tracking-wider text-ink-faint">
            {metric.label}
          </div>
          <div
            className={cn(
              'mt-1.5 font-mono text-[19px] font-semibold',
              TONE_CLASS[metric.tone],
            )}
          >
            {metric.value}
          </div>
        </div>
      ))}
    </div>
  );
}
