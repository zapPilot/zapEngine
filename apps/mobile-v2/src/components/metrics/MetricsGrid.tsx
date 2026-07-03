import { Text, View } from 'react-native';

import type { MetricTone } from '@/data/demo';
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
    <View className={cn('-m-1 flex-row flex-wrap', className)}>
      {metrics.map((metric) => (
        <View key={metric.label} className="w-1/2 p-1">
          <View
            className="rounded-2xl border border-line p-[13px]"
            style={{ backgroundColor: 'rgba(255,255,255,.025)' }}
          >
            <Text className="font-mono text-[9px] uppercase tracking-[0.45px] text-ink-faint">
              {metric.label}
            </Text>
            <Text
              className={cn(
                'mt-1.5 font-mono-semibold text-[19px]',
                TONE_CLASS[metric.tone],
              )}
            >
              {metric.value}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
