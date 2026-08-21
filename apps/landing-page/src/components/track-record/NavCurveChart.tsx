import type { DailySnapshot } from '@zapengine/types/strategy';
import type { StrategyEvent } from '@/data/track-record-events';
import { ChartAxis } from './ChartAxis';
import { ChartEmptyState } from './ChartEmptyState';
import { ChartHoverLayer } from './ChartHoverLayer.client';
import { ChartLegend } from './ChartLegend';
import type { ChartLegendItem } from './ChartLegend';
import { ChartZoom } from './ChartZoom.client';
import { allocationBar, allocationFromSnapshot } from './chartAllocation';
import { buildChartMarkers } from './chartEvents';
import * as geometry from './chartGeometry';

type EquityPoint = { date: string; value: number };

interface NavCurveChartProps {
  snapshots: DailySnapshot[];
  events?: readonly StrategyEvent[];
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

/** Only the categories actually present earn a legend slot. */
function legendItems(markers: readonly { asset: string; action: string }[]) {
  const items: ChartLegendItem[] = [
    { kind: 'series', label: 'Strategy', variant: 'strategy' },
  ];
  for (const asset of ['BTC', 'ETH', 'SPY'] as const) {
    if (markers.some((marker) => marker.asset === asset)) {
      items.push({ kind: 'asset', asset });
    }
  }
  for (const action of ['buy', 'sell', 'rotate'] as const) {
    if (markers.some((marker) => marker.action === action)) {
      items.push({ kind: 'action', action });
    }
  }
  return items;
}

export function NavCurveChart({
  snapshots,
  events = [],
  className,
}: NavCurveChartProps) {
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
  const markers = buildChartMarkers(events, points, domainMin, domainMax);
  const allocations = snapshots.map(allocationFromSnapshot);
  const tradedIndices = new Set(markers.map((marker) => marker.index));

  /**
   * A trade gets both sides of itself; every other day gets the position as it
   * stood. Day zero can be a trading day with nothing before it, which falls
   * back to the single bar rather than inventing a prior position.
   */
  function allocationBarsForIndex(index: number) {
    const current = allocations[index];
    if (!current) return null;
    const previous = index > 0 ? allocations[index - 1] : null;
    if (!tradedIndices.has(index) || !previous) return [allocationBar(current)];
    return [
      allocationBar(previous, { label: 'Before', showValues: false }),
      allocationBar(current, { label: 'After' }),
    ];
  }

  /**
   * One figure, rendered twice: inline, and again inside the zoom overlay. The
   * expanded copy drops the caller's className (its size comes from the
   * overlay) and carries no expand button of its own, which is what stops the
   * recursion.
   */
  const chartFigure = (expanded: boolean) => (
    <figure
      className={
        expanded ? 'nav-curve-chart' : `nav-curve-chart ${className ?? ''}`
      }
      aria-label="NAV curve"
    >
      <div className="nav-curve-header">
        <div>
          <p className="nav-curve-kicker">Indexed growth</p>
          <h3>Strategy NAV</h3>
        </div>
        <div className="nav-curve-header-tools">
          <ChartLegend
            items={legendItems(markers)}
            className="nav-curve-legend"
          />
          {!expanded && (
            <ChartZoom label="Strategy NAV">{chartFigure(true)}</ChartZoom>
          )}
        </div>
      </div>

      <ChartHoverLayer
        total={points.length}
        ariaLabel="Strategy NAV by date"
        labelForIndex={(index) => points[index]!.date}
        rowsForIndex={(index) => [
          {
            id: 'strategy',
            label: 'Strategy',
            value: points[index]!.value.toFixed(2),
            color: 'var(--accent)',
          },
        ]}
        focusYForIndex={(index) =>
          geometry.yForValue(points[index]!.value, domainMin, domainMax)
        }
        markers={markers}
        allocationForIndex={allocationBarsForIndex}
      >
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
      </ChartHoverLayer>

      <figcaption>Indexed to 100 at strategy start.</figcaption>
    </figure>
  );

  return chartFigure(false);
}
