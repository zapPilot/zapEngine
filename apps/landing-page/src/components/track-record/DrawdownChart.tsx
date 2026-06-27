import type { DailySnapshot } from '@zapengine/types/strategy';
import { CHART_DIMENSIONS } from '@/config/track-record';

interface DrawdownChartProps {
  snapshots: DailySnapshot[];
  className?: string;
}

const { width, height, padding } = CHART_DIMENSIONS;
const plotWidth = width - padding.left - padding.right;
const plotHeight = height - padding.top - padding.bottom;

function buildDrawdownSeries(
  snapshots: DailySnapshot[],
): Array<{ date: string; drawdown: number }> {
  if (snapshots.length === 0) return [];
  const navs = snapshots.map((s) => parseFloat(s.nav.usd));
  const series: Array<{ date: string; drawdown: number }> = [];
  let peak = navs[0]!;
  for (let i = 0; i < navs.length; i++) {
    const navVal = navs[i]!;
    if (navVal > peak) peak = navVal;
    series.push({
      date: snapshots[i]!.date,
      drawdown: peak > 0 ? (peak - navVal) / peak : 0,
    });
  }
  return series;
}

function xForPoint(index: number, total: number) {
  if (total <= 1) return padding.left;
  return padding.left + (index / (total - 1)) * plotWidth;
}

export function DrawdownChart({ snapshots, className }: DrawdownChartProps) {
  const points = buildDrawdownSeries(snapshots);

  if (points.length === 0) {
    return (
      <div className={`drawdown-chart-empty ${className ?? ''}`}>
        <p>No live data yet.</p>
      </div>
    );
  }

  const maxDD = Math.max(...points.map((p) => p.drawdown));
  const domainMax = Math.ceil(maxDD * 10) / 10 + 0.05;
  const yTicks = [0, domainMax / 2, domainMax];

  const startDate = points[0]?.date ?? '';
  const endDate = points[points.length - 1]?.date ?? '';

  const areaPath = points
    .map((pt, i) => {
      const x = xForPoint(i, points.length);
      const yBottom = padding.top + (pt.drawdown / domainMax) * plotHeight;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${yBottom.toFixed(2)}`;
    })
    .join(' ');

  const closePath =
    `L ${xForPoint(points.length - 1, points.length).toFixed(2)} ${padding.top.toFixed(2)} ` +
    `L ${padding.left.toFixed(2)} ${padding.top.toFixed(2)} Z`;

  return (
    <figure
      className={`drawdown-chart ${className ?? ''}`}
      aria-label="Drawdown chart"
    >
      <div className="drawdown-chart-header">
        <p className="drawdown-kicker">Drawdown</p>
        <h3>Max Drawdown: {(maxDD * 100).toFixed(2)}%</h3>
      </div>

      <svg
        className="drawdown-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Drawdown chart from ${startDate} to ${endDate}`}
      >
        <title>Drawdown chart</title>

        {yTicks.map((tick) => (
          <g className="chart-grid-line" key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={padding.top + (tick / domainMax) * plotHeight}
              y2={padding.top + (tick / domainMax) * plotHeight}
            />
            <text
              x={padding.left - 14}
              y={padding.top + (tick / domainMax) * plotHeight + 4}
            >
              {(tick * 100).toFixed(1)}%
            </text>
          </g>
        ))}

        <line
          className="chart-axis"
          x1={padding.left}
          x2={width - padding.right}
          y1={height - padding.bottom}
          y2={height - padding.bottom}
        />

        <path className="drawdown-area" d={areaPath + closePath} />

        <g className="chart-x-labels">
          <text x={padding.left} y={height - 18}>
            {startDate}
          </text>
          <text x={width - padding.right} y={height - 18}>
            {endDate}
          </text>
        </g>
      </svg>
    </figure>
  );
}
