import type { DailySnapshot } from '@zapengine/types/strategy';
import { ChartAxis } from './ChartAxis';
import { ChartEmptyState } from './ChartEmptyState';
import * as geometry from './chartGeometry';

type EquityPoint = { date: string; value: number };

interface NavCurveChartProps {
  snapshots: DailySnapshot[];
  className?: string;
}

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

export function NavCurveChart({ snapshots, className }: NavCurveChartProps) {
  const points = buildNavSeries(snapshots);

  if (points.length === 0) {
    return (
      <ChartEmptyState
        emptyClassName="nav-curve-chart-empty"
        className={className}
        message="No live data yet — backtest performance below."
      />
    );
  }

  const values = points.map((p) => p.value);
  const domainMin = Math.floor(Math.min(...values, 100) / 10) * 10;
  const domainMax = Math.ceil(Math.max(...values) / 10) * 10 + 10;
  const yTicks = geometry.midAndMaxTicks(domainMin, domainMax);
  const { startDate, endDate } = geometry.chartDateRange(points);
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
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        role="img"
        aria-label={`NAV curve from ${startDate} to ${endDate}`}
      >
        <title>NAV curve</title>

        <ChartAxis
          yTicks={yTicks}
          domainMin={domainMin}
          domainMax={domainMax}
          startDate={startDate}
          endDate={endDate}
        />

        <path
          className="chart-series strategy"
          d={geometry.pathForSeries(points, domainMin, domainMax)}
        />

        <circle
          className="chart-endpoint"
          cx={geometry.xForPoint(points.length - 1, points.length)}
          cy={geometry.yForValue(
            points[points.length - 1]!.value,
            domainMin,
            domainMax,
          )}
          r="4"
        />
        <text
          className="chart-end-label"
          x={geometry.xForPoint(points.length - 1, points.length) - 8}
          y={
            geometry.yForValue(
              points[points.length - 1]!.value,
              domainMin,
              domainMax,
            ) - 12
          }
        >
          {endValue}
        </text>
      </svg>

      <figcaption>Indexed to 100 at strategy start.</figcaption>
    </figure>
  );
}
