import type { CSSProperties } from 'react';
import type { MarketDmaPoint } from '@/data/market-signals';
import * as geometry from './chartGeometry';
import { ChartAxis } from './ChartAxis';
import { ChartEmptyState } from './ChartEmptyState';
import { ChartLegend } from './ChartLegend';
import { TokenIcon } from './TokenIcon';

interface MarketSeriesChartProps {
  kicker: string;
  title: string;
  points: MarketDmaPoint[];
  color: string;
  formatValue: (value: number) => string;
  dmaLabel?: string;
  caption?: string;
  className?: string;
  tokenSymbol?: string;
}

export function MarketSeriesChart({
  kicker,
  title,
  points,
  color,
  formatValue,
  dmaLabel = '200-DMA',
  caption,
  className,
  tokenSymbol,
}: MarketSeriesChartProps) {
  if (points.length === 0) {
    return (
      <ChartEmptyState
        className={className}
        emptyClassName="market-series-chart-empty"
        message={`No ${title} signal data available.`}
      />
    );
  }

  const dmaPoints = points.flatMap((point) =>
    point.dma === null ? [] : [{ date: point.date, value: point.dma }],
  );
  const values = [
    ...points.map((point) => point.value),
    ...dmaPoints.map((p) => p.value),
  ];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = maximum - minimum;
  const padding = (span || Math.abs(maximum) || 1) * 0.04;
  const domainMin = minimum - padding;
  const domainMax = maximum + padding;
  const latest = points.at(-1)!;
  const status = latest.dma === null ? null : latest.value >= latest.dma;
  const { startDate, endDate } = geometry.chartDateRange(points);
  const style = { '--series-color': color } as CSSProperties;

  return (
    <figure
      aria-label={`${title} market signal`}
      className={`market-series-chart ${className ?? ''}`}
      style={style}
    >
      <div className="market-series-chart-header">
        <div>
          <p className="market-series-kicker">{kicker}</p>
          <h3>
            {tokenSymbol ? <TokenIcon symbol={tokenSymbol} size={22} /> : null}
            {title}
          </h3>
        </div>
        <div className="signal-chart-tools">
          <ChartLegend
            items={[
              { kind: 'series', label: title, variant: 'market' },
              { kind: 'series', label: dmaLabel, variant: 'market-dma' },
            ]}
          />
          {status === null ? null : (
            <span className={`signal-chip ${status ? 'above' : 'below'}`}>
              {status ? '▲ Above 200-DMA' : '▼ Below 200-DMA'}
            </span>
          )}
        </div>
      </div>

      <svg
        aria-label={`${title} price and ${dmaLabel} chart`}
        className="market-series-svg"
        role="img"
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      >
        <title>{`${title} price and ${dmaLabel}`}</title>
        <ChartAxis
          domainMax={domainMax}
          domainMin={domainMin}
          endDate={endDate}
          formatYTick={formatValue}
          startDate={startDate}
          yTicks={geometry.midAndMaxTicks(domainMin, domainMax)}
        />
        <path
          className="chart-series market"
          d={geometry.pathForSeries(points, domainMin, domainMax)}
        />
        <path
          className="chart-series market-dma"
          d={geometry.pathForSeries(dmaPoints, domainMin, domainMax)}
        />
      </svg>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
