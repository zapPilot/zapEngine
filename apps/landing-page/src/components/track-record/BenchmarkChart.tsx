import type { DailySnapshot } from '@zapengine/types/strategy';
import * as geometry from './chartGeometry';
import { ChartAxis } from './ChartAxis';
import { ChartEmptyState } from './ChartEmptyState';

interface BenchmarkChartProps {
  snapshots: DailySnapshot[];
  className?: string;
}

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

export function BenchmarkChart({ snapshots, className }: BenchmarkChartProps) {
  const strategySeries = snapshots.map((s) => {
    const val = parseFloat(s.performance.cumulativeReturn.replace('%', ''));
    return { date: s.date, value: val };
  });

  const dcaSeries = buildBenchmarkSeries(snapshots, 'DCA Classic');

  if (strategySeries.length === 0) {
    return (
      <ChartEmptyState
        emptyClassName="benchmark-chart-empty"
        className={className}
        message="No live data yet."
      />
    );
  }

  const allValues = [
    ...strategySeries.map((p) => p.value),
    ...dcaSeries.map((p) => p.value),
  ];
  const domainMin = Math.floor(Math.min(...allValues, 0) / 10) * 10;
  const domainMax = Math.ceil(Math.max(...allValues) / 10) * 10 + 5;
  const yTicks = geometry.midAndMaxTicks(domainMin, domainMax);
  const { startDate, endDate } = geometry.chartDateRange(snapshots);

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
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        role="img"
        aria-label="Benchmark comparison chart"
      >
        <title>Benchmark comparison</title>

        <ChartAxis
          yTicks={yTicks}
          domainMin={domainMin}
          domainMax={domainMax}
          startDate={startDate}
          endDate={endDate}
          formatYTick={(tick) => `${tick}%`}
        />

        <path
          className="chart-series strategy"
          d={geometry.pathForSeries(strategySeries, domainMin, domainMax)}
        />

        {dcaSeries.length > 0 && (
          <path
            className="chart-series dca"
            d={geometry.pathForSeries(dcaSeries, domainMin, domainMax)}
          />
        )}
      </svg>
    </figure>
  );
}
