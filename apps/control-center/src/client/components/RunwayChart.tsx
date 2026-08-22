import { usd } from '../format.js';

export function RunwayChart(props: {
  accrued: number | null | undefined;
  generatedAt?: string;
  projected: number | null | undefined;
}) {
  const now = props.generatedAt ? new Date(props.generatedAt) : new Date();
  const days = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const elapsed = Math.min(days, now.getUTCDate());
  const todayX = 72 + (elapsed / days) * 856;
  const accrued = props.accrued ?? 0;
  const projected = props.projected ?? accrued;
  const ceiling = Math.max(
    10,
    Math.ceil(Math.max(accrued, projected) / 20) * 20,
  );
  const y = (value: number) => 210 - (value / ceiling) * 150;
  const hasData = props.accrued !== null && props.accrued !== undefined;

  return (
    <section className="runway-panel" aria-labelledby="runway-title">
      <div className="section-heading runway-heading">
        <h2 id="runway-title">Current month cost pace</h2>
        <div className="chart-legend" aria-hidden="true">
          <span>
            <i className="legend-actual" />
            Accrued
          </span>
          <span>
            <i className="legend-projected" />
            Projected
          </span>
        </div>
      </div>
      {hasData ? (
        <svg
          aria-label={`Accrued ${usd(accrued)}, projected ${usd(projected)}`}
          className="runway-chart"
          role="img"
          viewBox="0 0 1000 260"
        >
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
          <line
            className="today-marker"
            x1={todayX}
            x2={todayX}
            y1="42"
            y2="220"
          />
          <text className="today-label" x={todayX} y="31" textAnchor="middle">
            Today
          </text>
          <path
            className="actual-line"
            d={`M 72 210 L ${todayX} ${y(accrued)}`}
          />
          <path
            className="projected-line"
            d={`M ${todayX} ${y(accrued)} L 928 ${y(projected)}`}
          />
          <circle className="actual-point" cx={todayX} cy={y(accrued)} r="5" />
          <circle
            className="projected-point"
            cx="928"
            cy={y(projected)}
            r="5"
          />
          <text className="actual-value" x={todayX + 10} y={y(accrued) - 12}>
            {usd(accrued)}
          </text>
          <text
            className="projected-value"
            x="918"
            y={y(projected) - 12}
            textAnchor="end"
          >
            {usd(projected)}
          </text>
          <text className="chart-axis" x="72" y="241">
            {monthLabel(now)} 1
          </text>
          <text className="chart-axis" x="928" y="241" textAnchor="end">
            {monthLabel(now)} {days}
          </text>
        </svg>
      ) : (
        <div className="chart-empty">
          Connect OpenRouter or configure DeBank unit pricing to plot this
          month’s pace.
        </div>
      )}
    </section>
  );
}

function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}
