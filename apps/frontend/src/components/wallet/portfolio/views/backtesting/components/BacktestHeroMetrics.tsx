import type { HeroMetric } from './backtestTerminalMetrics';
import { phosphorGlowStyle } from './terminalStyles';

export interface BacktestHeroMetricsProps {
  /** Hero metric entries to display */
  metrics: HeroMetric[];
}

/**
 * Three-column hero metrics grid with ASCII bars and phosphor glow.
 *
 * @param props - {@link BacktestHeroMetricsProps}
 * @returns A grid of hero metrics, or nothing when the list is empty
 *
 * @example
 * ```tsx
 * <BacktestHeroMetrics metrics={createHeroMetrics(strategy)} />
 * ```
 */
export function BacktestHeroMetrics({
  metrics,
}: BacktestHeroMetricsProps): React.ReactElement | null {
  if (metrics.length === 0) {
    return null;
  }

  return (
    <div className="px-6 py-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
        {metrics.map((metric, index) => (
          <div
            key={metric.label}
            className={`px-4 py-3 border-t-2 border-emerald-400/20 ${
              index > 0 ? 'md:border-l border-emerald-400/20' : ''
            }`}
          >
            <div
              className="text-xs text-emerald-400/60 uppercase tracking-widest mb-2"
              style={phosphorGlowStyle}
            >
              {metric.label}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-emerald-400/80 text-sm">{metric.bar}</span>
              <span
                className={`text-xl font-bold ${metric.color}`}
                style={phosphorGlowStyle}
              >
                {metric.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
