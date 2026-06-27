import type { DailySnapshot } from '@zapengine/types/strategy';
import { CHART_DIMENSIONS } from '@/config/track-record';

interface BenchmarkChartProps {
  snapshots: DailySnapshot[];
  className?: string;
}

const { width, height, padding } = CHART_DIMENSIONS;
const plotWidth = width - padding.left - padding.right;
const plotHeight = height - padding.top - padding.bottom;

function buildBenchmarkSeries(
  snapshots: DailySnapshot[],
  benchmarkName: string,
): Array<{ date: string; value: number }> {
  if (snapshots.length === 0) return [];
  const startBenchmark = snapshots.find((s) =>
    s.benchmarks.some((b) => b.name === benchmarkName),
  );
  if (!startBenchmark) return [];
  const startNavVal = parseFloat(snapshots[0]!.nav.usd);
  if (startNavVal === 0) return [];
  const firstBenchmarkBase =
    (parseFloat(snapshots[0]!.nav.usd) / startNavVal - 1) * 100;
  return snapshots.map((s) => {
    const benchmark = s.benchmarks.find((b) => b.name === benchmarkName);
    const cumulativeReturn = benchmark
      ? parseFloat(benchmark.cumulativeReturn.replace('%', ''))
      : firstBenchmarkBase;
    return { date: s.date, value: cumulativeReturn };
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
  points: Array<{ value: number }>,
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

export function BenchmarkChart({ snapshots, className }: BenchmarkChartProps) {
  const strategySeries = snapshots.map((s) => {
    const val = parseFloat(s.performance.cumulativeReturn.replace('%', ''));
    return { date: s.date, value: val };
  });

  const dcaSeries = buildBenchmarkSeries(snapshots, 'DCA Classic');

  if (strategySeries.length === 0) {
    return (
      <div className={`benchmark-chart-empty ${className ?? ''}`}>
        <p>No live data yet.</p>
      </div>
    );
  }

  const allValues = [
    ...strategySeries.map((p) => p.value),
    ...dcaSeries.map((p) => p.value),
  ];
  const domainMin = Math.floor(Math.min(...allValues, 0) / 10) * 10;
  const domainMax = Math.ceil(Math.max(...allValues) / 10) * 10 + 5;
  const yTicks = [Math.round((domainMin + domainMax) / 2), domainMax];

  const startDate = snapshots[0]?.date ?? '';
  const endDate = snapshots[snapshots.length - 1]?.date ?? '';

  return (
    <figure
      className={`benchmark-chart ${className ?? ''}`}
      aria-label="Benchmark comparison"
    >
      <div className="benchmark-chart-header">
        <div>
          <p className="benchmark-kicker">Comparison</p>
          <h3>Strategy vs DCA Classic</h3>
        </div>
        <div className="benchmark-legend" aria-hidden>
          <span className="legend-item strategy">
            <span />
            Strategy
          </span>
          {dcaSeries.length > 0 && (
            <span className="legend-item dca">
              <span />
              DCA Classic
            </span>
          )}
        </div>
      </div>

      <svg
        className="benchmark-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Benchmark comparison chart"
      >
        <title>Benchmark comparison</title>

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
              {tick}%
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
          d={pathForSeries(strategySeries, domainMin, domainMax)}
        />

        {dcaSeries.length > 0 && (
          <path
            className="chart-series dca"
            d={pathForSeries(dcaSeries, domainMin, domainMax)}
          />
        )}

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
