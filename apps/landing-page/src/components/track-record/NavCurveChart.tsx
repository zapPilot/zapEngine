import type { DailySnapshot } from '@zapengine/types/strategy';
import { CHART_DIMENSIONS } from '@/config/track-record';

type EquityPoint = { date: string; value: number };

interface NavCurveChartProps {
  snapshots: DailySnapshot[];
  className?: string;
}

const { width, height, padding } = CHART_DIMENSIONS;
const plotWidth = width - padding.left - padding.right;
const plotHeight = height - padding.top - padding.bottom;

function buildNavSeries(snapshots: DailySnapshot[]): EquityPoint[] {
  if (snapshots.length === 0) return [];
  const startNav = parseFloat(snapshots[0]!.nav.usd);
  if (startNav === 0)
    return snapshots.map((s) => ({ date: s.date, value: 100 }));
  return snapshots.map((s) => {
    const nav = parseFloat(s.nav.usd);
    return { date: s.date, value: (nav / startNav) * 100 };
  });
}

function xForPoint(index: number, total: number) {
  if (total <= 1) return padding.left;
  return padding.left + (index / (total - 1)) * plotWidth;
}

function yForValue(value: number, domainMin: number, domainMax: number) {
  const ratio = (domainMax - value) / (domainMax - domainMin);
  return padding.top + ratio * plotHeight;
}

function pathForSeries(
  points: EquityPoint[],
  domainMin: number,
  domainMax: number,
) {
  return points
    .map((pt, i) => {
      const cmd = i === 0 ? 'M' : 'L';
      return `${cmd} ${xForPoint(i, points.length).toFixed(2)} ${yForValue(pt.value, domainMin, domainMax).toFixed(2)}`;
    })
    .join(' ');
}

export function NavCurveChart({ snapshots, className }: NavCurveChartProps) {
  const points = buildNavSeries(snapshots);

  if (points.length === 0) {
    return (
      <div className={`nav-curve-chart-empty ${className ?? ''}`}>
        <p>No live data yet — backtest performance below.</p>
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const domainMin = Math.floor(Math.min(...values, 100) / 10) * 10;
  const domainMax = Math.ceil(Math.max(...values) / 10) * 10 + 10;
  const yTicks = [Math.round((domainMin + domainMax) / 2), domainMax];

  const startDate = points[0]?.date ?? '';
  const endDate = points[points.length - 1]?.date ?? '';
  const endValue = points[points.length - 1]?.value.toFixed(2) ?? '0';

  return (
    <figure
      className={`nav-curve-chart ${className ?? ''}`}
      aria-label="NAV curve"
    >
      <div className="nav-curve-header">
        <div>
          <p className="nav-curve-kicker">Indexed growth</p>
          <h3>Strategy NAV</h3>
        </div>
        <div className="nav-curve-legend" aria-hidden>
          <span className="legend-item strategy">
            <span />
            Strategy
          </span>
        </div>
      </div>

      <svg
        className="nav-curve-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`NAV curve from ${startDate} to ${endDate}`}
      >
        <title>NAV curve</title>

        {yTicks.map((tick) => (
          <g className="chart-grid-line" key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yForValue(tick, domainMin, domainMax)}
              y2={yForValue(tick, domainMin, domainMax)}
            />
            <text
              x={padding.left - 14}
              y={yForValue(tick, domainMin, domainMax) + 4}
            >
              {tick}
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

        <path
          className="chart-series strategy"
          d={pathForSeries(points, domainMin, domainMax)}
        />

        <circle
          className="chart-endpoint"
          cx={xForPoint(points.length - 1, points.length)}
          cy={yForValue(points[points.length - 1]!.value, domainMin, domainMax)}
          r="4"
        />
        <text
          className="chart-end-label"
          x={xForPoint(points.length - 1, points.length) - 8}
          y={
            yForValue(points[points.length - 1]!.value, domainMin, domainMax) -
            12
          }
        >
          {endValue}
        </text>

        <g className="chart-x-labels">
          <text x={padding.left} y={height - 18}>
            {startDate}
          </text>
          <text x={width - padding.right} y={height - 18}>
            {endDate}
          </text>
        </g>
      </svg>

      <figcaption>Indexed to 100 at strategy start.</figcaption>
    </figure>
  );
}
