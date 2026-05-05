import { ArrowRight } from 'lucide-react';
import { MESSAGES } from '@/config/messages';
import equityCurve from '@/data/equity-curve.json';

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

const CHART_WIDTH = 720;
const CHART_HEIGHT = 320;
const CHART_PADDING = {
  top: 30,
  right: 34,
  bottom: 54,
  left: 56,
};
const PLOT_WIDTH = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
const PLOT_HEIGHT = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
const EQUITY_SERIES = equityCurve.series as EquitySeries[];
const ALL_VALUES = EQUITY_SERIES.flatMap((series) =>
  series.values.map((point) => point.value),
);
const DOMAIN_MIN =
  Math.floor(
    Math.min(...ALL_VALUES, 100 + equityCurve.drawdownBand.dcaPercent) / 10,
  ) * 10;
const DOMAIN_MAX = Math.ceil(Math.max(...ALL_VALUES) / 10) * 10 + 10;
const Y_TICKS = [50, 100, 150, 200];

function xForPoint(index: number, totalPoints: number) {
  if (totalPoints <= 1) {
    return CHART_PADDING.left;
  }
  return CHART_PADDING.left + (index / (totalPoints - 1)) * PLOT_WIDTH;
}

function yForValue(value: number) {
  const ratio = (DOMAIN_MAX - value) / (DOMAIN_MAX - DOMAIN_MIN);
  return CHART_PADDING.top + ratio * PLOT_HEIGHT;
}

function pathForSeries(series: EquitySeries) {
  return series.values
    .map((point, index) => {
      const command = index === 0 ? 'M' : 'L';
      return `${command} ${xForPoint(index, series.values.length).toFixed(2)} ${yForValue(point.value).toFixed(2)}`;
    })
    .join(' ');
}

function lastPoint(series: EquitySeries): EquityPoint {
  const point = series.values[series.values.length - 1];
  if (point === undefined) {
    throw new Error(
      `Equity series ${series.id} must include at least one point`,
    );
  }
  return point;
}

export function BacktestProofV2() {
  const drawdownTop = yForValue(100);
  const drawdownBottom = yForValue(100 + equityCurve.drawdownBand.dcaPercent);

  return (
    <section className="v2-section backtest-proof" id="proof">
      <div className="section-inner">
        <div className="section-kicker">Backtest proof</div>
        <div className="section-heading-row">
          <div>
            <h2>{MESSAGES.backtest.title}</h2>
            <p>{MESSAGES.backtest.subtitle}</p>
          </div>
          <a className="method-link" href={MESSAGES.backtest.ctaLink}>
            {MESSAGES.backtest.ctaText}
            <ArrowRight aria-hidden />
          </a>
        </div>

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
              {equityCurve.window.end}. Strategy finishes at 221.44 and DCA
              Classic finishes at 85.64.
            </desc>

            <rect
              className="equity-drawdown-band"
              x={CHART_PADDING.left}
              y={drawdownTop}
              width={PLOT_WIDTH}
              height={drawdownBottom - drawdownTop}
              rx="6"
            />

            {Y_TICKS.map((tick) => (
              <g className="equity-grid-line" key={tick}>
                <line
                  x1={CHART_PADDING.left}
                  x2={CHART_WIDTH - CHART_PADDING.right}
                  y1={yForValue(tick)}
                  y2={yForValue(tick)}
                />
                <text x={CHART_PADDING.left - 14} y={yForValue(tick) + 4}>
                  {tick}
                </text>
              </g>
            ))}

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
              const endY = yForValue(endPoint.value);

              return (
                <g className={`equity-series ${series.id}`} key={series.id}>
                  <path d={pathForSeries(series)} stroke={series.color} />
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
            across the pinned window.
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
      </div>
    </section>
  );
}
