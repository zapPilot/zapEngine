import type { MarketGaugePoint } from '@/data/market-signals';
import * as geometry from './chartGeometry';
import { ChartAxis } from './ChartAxis';
import { ChartEmptyState } from './ChartEmptyState';

interface SentimentChartProps {
  kicker: string;
  title: string;
  points: MarketGaugePoint[];
  caption?: string;
  className?: string;
}

const BANDS = [
  { value: 25, label: 'Extreme fear' },
  { value: 45, label: 'Fear' },
  { value: 55, label: 'Greed' },
  { value: 75, label: 'Extreme greed' },
] as const;

function defaultRegime(value: number): string {
  if (value <= 25) return 'Extreme Fear';
  if (value <= 45) return 'Fear';
  if (value < 55) return 'Neutral';
  if (value <= 75) return 'Greed';
  return 'Extreme Greed';
}

export function SentimentChart({
  kicker,
  title,
  points,
  caption,
  className,
}: SentimentChartProps) {
  if (points.length === 0) {
    return (
      <ChartEmptyState
        className={className}
        emptyClassName="sentiment-chart-empty"
        message={`No ${title} signal data available.`}
      />
    );
  }

  const latest = points.at(-1)!;
  const { startDate, endDate } = geometry.chartDateRange(points);

  return (
    <figure
      aria-label={`${title} sentiment signal`}
      className={`sentiment-chart ${className ?? ''}`}
    >
      <div className="sentiment-chart-header">
        <div>
          <p className="sentiment-kicker">{kicker}</p>
          <h3>{title}</h3>
        </div>
        <span className="signal-chip">
          {Math.round(latest.value)} ·{' '}
          {latest.regime ?? defaultRegime(latest.value)}
        </span>
      </div>

      <svg
        aria-label={`${title} zero to one hundred chart`}
        className="sentiment-svg"
        role="img"
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      >
        <title>{title}</title>
        <ChartAxis
          domainMax={100}
          domainMin={0}
          endDate={endDate}
          startDate={startDate}
          yTicks={[0, 50, 100]}
        />
        {BANDS.map((band) => (
          <g className="sentiment-band" key={band.value}>
            <line
              x1={geometry.padding.left}
              x2={geometry.width - geometry.padding.right}
              y1={geometry.yForValue(band.value, 0, 100)}
              y2={geometry.yForValue(band.value, 0, 100)}
            />
            <text
              x={geometry.width - geometry.padding.right}
              y={geometry.yForValue(band.value, 0, 100) - 5}
            >
              {band.label}
            </text>
          </g>
        ))}
        <path
          className="chart-series sentiment"
          d={geometry.pathForSeries(points, 0, 100)}
        />
      </svg>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
