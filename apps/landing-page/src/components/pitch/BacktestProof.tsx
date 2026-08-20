import { ArrowRight } from 'lucide-react';
import { MESSAGES } from '@/config/messages';
import { CHART_DIMENSIONS } from '@/config/track-record';
import equityCurve from '@/data/equity-curve.json';
import {
  pathForSeries,
  plotWidth,
  xForPoint,
  yForValue,
} from '@/components/track-record/chartGeometry';
import { Section } from '@/components/primitives/Section';

type EquityPoint = {
  date: string;
  value: number;
};

type EquitySeries = {
  id: string;
  label: string;
  color: string;
  values: EquityPoint[];
};

const {
  width: CHART_WIDTH,
  height: CHART_HEIGHT,
  padding: CHART_PADDING,
} = CHART_DIMENSIONS;
const EQUITY_SERIES = equityCurve.series as EquitySeries[];
const Y_TICKS = [50, 100, 150, 200];
const ALL_VALUES = EQUITY_SERIES.flatMap((series) =>
  series.values.map((point) => point.value),
);
const DOMAIN_MIN =
  Math.floor(
    Math.min(...ALL_VALUES, 100 + equityCurve.drawdownBand.dcaPercent) / 10,
  ) * 10;
const DOMAIN_MAX =
  Math.ceil(Math.max(...ALL_VALUES, ...Y_TICKS) / 10) * 10 + 10;

function lastPoint(series: EquitySeries): EquityPoint {
  const point = series.values[series.values.length - 1];
  if (point === undefined) {
    throw new Error(
      `Equity series ${series.id} must include at least one point`,
    );
  }
  return point;
}

function lastPointForSeries(seriesId: string): EquityPoint {
  const series = EQUITY_SERIES.find((item) => item.id === seriesId);
  if (series === undefined) {
    throw new Error(`Equity series ${seriesId} is missing`);
  }
  return lastPoint(series);
}

export function BacktestProof() {
  const drawdownTop = yForValue(100, DOMAIN_MIN, DOMAIN_MAX);
  const drawdownBottom = yForValue(
    100 + equityCurve.drawdownBand.dcaPercent,
    DOMAIN_MIN,
    DOMAIN_MAX,
  );
  const strategyEndValue = lastPointForSeries('strategy').value.toFixed(2);
  const dcaEndValue = lastPointForSeries('dca').value.toFixed(2);

  return (
    <Section
      id="proof"
      className="backtest-proof"
      kicker="Backtest proof"
      title={MESSAGES.backtest.title}
      subtitle={MESSAGES.backtest.subtitle}
      headingAction={
        <a className="method-link" href={MESSAGES.backtest.ctaLink}>
          {MESSAGES.backtest.ctaText}
          <ArrowRight aria-hidden />
        </a>
      }
    >
      <figure className="equity-curve" aria-labelledby="equity-curve-title">
        <div className="equity-curve-header">
          <div>
            <p className="equity-curve-kicker">Indexed growth</p>
            <h3 id="equity-curve-title">Strategy vs DCA Classic</h3>
          </div>
          <div className="equity-curve-legend" aria-hidden>
            {EQUITY_SERIES.map((series) => (
              <span className={`legend-item ${series.id}`} key={series.id}>
                <span />
                {series.label}
              </span>
            ))}
          </div>
        </div>

        <svg
          className="equity-curve-chart"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-describedby="equity-curve-description"
        >
          <title>Strategy equity curve versus DCA Classic</title>
          <desc id="equity-curve-description">
            Indexed 500-day equity curve from {equityCurve.window.start} to{' '}
            {equityCurve.window.end}. Strategy finishes at {strategyEndValue}{' '}
            and DCA Classic finishes at {dcaEndValue}.
          </desc>

          <rect
            className="equity-drawdown-band"
            x={CHART_PADDING.left}
            y={drawdownTop}
            width={plotWidth}
            height={drawdownBottom - drawdownTop}
            rx="6"
          />

          {Y_TICKS.map((tick) => {
            const y = yForValue(tick, DOMAIN_MIN, DOMAIN_MAX);

            return (
              <g className="equity-grid-line" key={tick}>
                <line
                  x1={CHART_PADDING.left}
                  x2={CHART_WIDTH - CHART_PADDING.right}
                  y1={y}
                  y2={y}
                />
                <text x={CHART_PADDING.left - 14} y={y + 4}>
                  {tick}
                </text>
              </g>
            );
          })}

          <line
            className="equity-axis"
            x1={CHART_PADDING.left}
            x2={CHART_WIDTH - CHART_PADDING.right}
            y1={CHART_HEIGHT - CHART_PADDING.bottom}
            y2={CHART_HEIGHT - CHART_PADDING.bottom}
          />

          {EQUITY_SERIES.map((series) => {
            const endPoint = lastPoint(series);
            const endX = xForPoint(
              series.values.length - 1,
              series.values.length,
            );
            const endY = yForValue(endPoint.value, DOMAIN_MIN, DOMAIN_MAX);

            return (
              <g className={`equity-series ${series.id}`} key={series.id}>
                <path
                  d={pathForSeries(series.values, DOMAIN_MIN, DOMAIN_MAX)}
                  stroke={series.color}
                />
                <circle cx={endX} cy={endY} r="4" />
                <text x={endX - 8} y={endY - 12}>
                  {endPoint.value.toFixed(2)}
                </text>
              </g>
            );
          })}

          <g className="equity-x-labels">
            <text x={CHART_PADDING.left} y={CHART_HEIGHT - 18}>
              {equityCurve.window.start}
            </text>
            <text x={CHART_WIDTH - CHART_PADDING.right} y={CHART_HEIGHT - 18}>
              {equityCurve.window.end}
            </text>
          </g>
        </svg>

        <figcaption>
          Indexed to 100. Shaded band marks the observed max-drawdown range
          across the backtest window.
        </figcaption>
      </figure>

      <div className="backtest-grid">
        {MESSAGES.backtest.stats.map((stat) => (
          <article className="backtest-stat" key={stat.label}>
            <p>{stat.label}</p>
            <strong>{stat.value}</strong>
            <span>{stat.sublabel}</span>
          </article>
        ))}
      </div>

      <div className="comparison-row" aria-label="Strategy versus DCA">
        {MESSAGES.backtest.comparison.map((item) => (
          <div className="comparison-item" key={item.label}>
            <strong>{item.label}</strong>
            <span>ROI {item.roi}</span>
            <span>Max DD {item.maxDrawdown}</span>
            <span>{item.trades} trades</span>
          </div>
        ))}
      </div>

      <p className="proof-disclaimer">{MESSAGES.backtest.disclaimer}</p>
    </Section>
  );
}
