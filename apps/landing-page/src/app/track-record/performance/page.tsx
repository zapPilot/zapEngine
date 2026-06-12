'use client';

import { useTrackRecord } from '@/hooks/useTrackRecord';
import { NavCurveChart } from '@/components/track-record/NavCurveChart';
import { DrawdownChart } from '@/components/track-record/DrawdownChart';
import { BenchmarkChart } from '@/components/track-record/BenchmarkChart';
import { MetricsRow } from '@/components/track-record/MetricsRow';

export default function PerformancePage() {
  const state = useTrackRecord();
  const { snapshots, summary, isLoading } = state;

  if (isLoading) {
    return (
      <div className="track-record-loading">
        <p>Loading performance data…</p>
      </div>
    );
  }

  return (
    <div className="track-record-performance">
      <h2>Performance</h2>

      <section className="perf-charts">
        <NavCurveChart snapshots={snapshots} />
        <DrawdownChart snapshots={snapshots} />
      </section>

      <BenchmarkChart snapshots={snapshots} />

      <section className="perf-stats">
        <h3>Key Statistics</h3>
        <MetricsRow summary={summary} />
      </section>

      <section className="perf-stats-grid">
        <div className="stat-card">
          <p className="stat-label">Worst Day</p>
          <strong>{summary.worstDay}</strong>
          <span>{summary.worstDayDate}</span>
        </div>
        <div className="stat-card">
          <p className="stat-label">Best Day</p>
          <strong>{summary.bestDay}</strong>
          <span>{summary.bestDayDate}</span>
        </div>
        <div className="stat-card">
          <p className="stat-label">Max Drawdown</p>
          <strong>{summary.maxDrawdown}</strong>
          <span>{summary.maxDrawdownDate}</span>
        </div>
        <div className="stat-card">
          <p className="stat-label">Time Underwater</p>
          <strong>{summary.timeUnderwater}</strong>
          <span>of {summary.totalDays} days tracked</span>
        </div>
      </section>
    </div>
  );
}
