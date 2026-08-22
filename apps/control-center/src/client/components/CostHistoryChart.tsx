import type { MonthlyCostPoint } from '../../shared/types.js';
import { filterKnownAccruedCost, usd } from '../format.js';

export function CostHistoryChart({ points }: { points: MonthlyCostPoint[] }) {
  const known = filterKnownAccruedCost(points);
  if (known.length === 0) {
    return (
      <section className="runway-panel">
        <div className="section-heading">
          <h2>Monthly cost history</h2>
        </div>
        <div className="chart-empty">
          Monthly totals will build up from persisted snapshots.
        </div>
      </section>
    );
  }

  const max = Math.max(10, ...known.map((point) => point.accruedCostUsd));
  return (
    <section className="runway-panel">
      <div className="section-heading">
        <h2>Monthly cost history</h2>
      </div>
      <div className="usage-signals">
        {known.map((point) => (
          <div className="usage-row" key={point.month}>
            <span>{formatMonth(point.month)}</span>
            <strong className="mono">{usd(point.accruedCostUsd)}</strong>
            <progress max={max} value={point.accruedCostUsd} />
          </div>
        ))}
      </div>
    </section>
  );
}

function formatMonth(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}-01T00:00:00.000Z`));
}
