import type { PerformanceSummary } from '@/data/track-record-accessor';

interface MetricsRowProps {
  summary: PerformanceSummary;
  className?: string;
}

export function MetricsRow({ summary, className }: MetricsRowProps) {
  const stats = [
    { label: 'Cumulative Return', value: summary.cumulativeReturn },
    { label: 'Annualized Return', value: summary.annualizedReturn },
    { label: 'Max Drawdown', value: summary.maxDrawdown },
    { label: 'Sharpe', value: summary.sharpe },
    { label: 'Sortino', value: summary.sortino },
    { label: 'Volatility (30d)', value: summary.volatility30d },
    { label: 'Best Day', value: `${summary.bestDay} (${summary.bestDayDate})` },
    {
      label: 'Worst Day',
      value: `${summary.worstDay} (${summary.worstDayDate})`,
    },
    { label: 'Time Underwater', value: summary.timeUnderwater },
    { label: 'Days Tracked', value: String(summary.totalDays) },
  ];

  return (
    <div className={`metrics-row ${className ?? ''}`}>
      {stats.map((stat) => (
        <article className="metric-cell" key={stat.label}>
          <p className="metric-label">{stat.label}</p>
          <strong className="metric-value">{stat.value}</strong>
        </article>
      ))}
    </div>
  );
}
