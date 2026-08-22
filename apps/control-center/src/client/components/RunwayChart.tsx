import type { CostHistoryPoint } from '../../shared/types.js';
import { filterKnownAccruedCost, usd } from '../format.js';

export function RunwayChart(props: {
  history: CostHistoryPoint[];
  projected: number | null | undefined;
}) {
  const known = filterKnownAccruedCost(props.history);
  if (known.length === 0) {
    return (
      <section className="runway-panel" aria-labelledby="runway-title">
        <div className="section-heading runway-heading">
          <h2 id="runway-title">Current month cost pace</h2>
        </div>
        <div className="chart-empty">
          Daily snapshots will appear after the first cost sync.
        </div>
      </section>
    );
  }

  const last = known.at(-1)!;
  const now = new Date(`${last.date}T00:00:00.000Z`);
  const days = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const projected = props.projected ?? last.accruedCostUsd;
  const ceiling = Math.max(
    10,
    Math.ceil(
      Math.max(projected, ...known.map((point) => point.accruedCostUsd)) / 20,
    ) * 20,
  );
  const x = (date: string) =>
    72 + ((Number(date.slice(8, 10)) - 1) / Math.max(days - 1, 1)) * 856;
  const y = (value: number) => 210 - (value / ceiling) * 150;
  const path = known
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${x(point.date)} ${y(point.accruedCostUsd)}`,
    )
    .join(' ');
  const todayX = x(last.date);

  return (
    <section className="runway-panel" aria-labelledby="runway-title">
      <div className="section-heading runway-heading">
        <h2 id="runway-title">Current month cost pace</h2>
        <div className="chart-legend" aria-hidden="true">
          <span>
            <i className="legend-actual" />
            Persisted daily
          </span>
          <span>
            <i className="legend-projected" />
            Projected
          </span>
        </div>
      </div>
      <svg className="runway-chart" role="img" viewBox="0 0 1000 260">
        {[0, 0.25, 0.5, 0.75, 1].map((step) => {
          const gridY = 210 - step * 150;
          return (
            <g key={step}>
              <line
                className="chart-grid"
                x1="72"
                x2="928"
                y1={gridY}
                y2={gridY}
              />
              <text
                className="chart-axis"
                x="58"
                y={gridY + 4}
                textAnchor="end"
              >
                {usd(ceiling * step)}
              </text>
            </g>
          );
        })}
        <path className="actual-line" d={path} />
        <path
          className="projected-line"
          d={`M ${todayX} ${y(last.accruedCostUsd)} L 928 ${y(projected)}`}
        />
        <circle
          className="actual-point"
          cx={todayX}
          cy={y(last.accruedCostUsd)}
          r="5"
        />
        <circle className="projected-point" cx="928" cy={y(projected)} r="5" />
        <text className="chart-axis" x="72" y="241">
          {monthLabel(now)} 1
        </text>
        <text className="chart-axis" x="928" y="241" textAnchor="end">
          {monthLabel(now)} {days}
        </text>
      </svg>
    </section>
  );
}

function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}
