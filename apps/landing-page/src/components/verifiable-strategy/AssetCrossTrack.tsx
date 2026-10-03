import { distancePercent } from '@/lib/verifiable-strategy/encoding';
import type { CalculatorInput } from '@/lib/verifiable-strategy/types';

type Row = CalculatorInput['current'][number];

const WIDTH = 140;
const HEIGHT = 48;
const LEFT = 8;
const RIGHT = WIDTH - 8;

// Float conversion is confined to SVG geometry; encoding uses the exact strings.
function plot(previous: Row, current: Row) {
  const values = [previous.price, previous.dma, current.price, current.dma].map(
    Number,
  );
  if (values.some((value) => !Number.isFinite(value) || value <= 0))
    return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = (high - low) * 0.2 || high * 0.01;
  const y = (value: number) =>
    4 + ((high + pad - value) / (high - low + 2 * pad)) * (HEIGHT - 8);
  const [pricePrev, avgPrev, priceNow, avgNow] = values.map(y) as [
    number,
    number,
    number,
    number,
  ];
  // Where the price line meets the average line inside the day, if it does.
  const before = pricePrev - avgPrev;
  const after = priceNow - avgNow;
  const t = before * after < 0 ? before / (before - after) : null;
  const crossing =
    t === null
      ? null
      : {
          x: LEFT + t * (RIGHT - LEFT),
          y: pricePrev + t * (priceNow - pricePrev),
        };
  return { pricePrev, avgPrev, priceNow, avgNow, crossing };
}

export function AssetCrossTrack({
  asset,
  previous,
  current,
}: {
  asset: string;
  previous: Row;
  current: Row;
}) {
  const before = distancePercent(previous);
  const after = distancePercent(current);
  const points = before !== null && after !== null && plot(previous, current);
  const label = `${asset}: yesterday ${before ?? 'missing'}, today ${after ?? 'missing'} relative to 200-day average`;
  return (
    <div
      className="calc-chart"
      style={{ color: `var(--event-${asset.toLowerCase()})` }}
    >
      {points ? (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>
          <line
            className="calc-chart-average"
            x1={LEFT}
            x2={RIGHT}
            y1={points.avgPrev}
            y2={points.avgNow}
          />
          <line
            className="calc-chart-price"
            x1={LEFT}
            x2={RIGHT}
            y1={points.pricePrev}
            y2={points.priceNow}
          />
          {points.crossing && (
            <circle
              className="calc-chart-crossing"
              cx={points.crossing.x}
              cy={points.crossing.y}
              r="6"
            />
          )}
          <circle
            className="calc-chart-yesterday"
            cx={LEFT}
            cy={points.pricePrev}
            r="3"
          />
          <circle cx={RIGHT} cy={points.priceNow} r="3.5" fill="currentColor" />
        </svg>
      ) : (
        <p className="calc-chart-missing" role="img" aria-label={label}>
          Missing data
        </p>
      )}
      <span className="calc-chart-distance">
        {before ?? '—'} → {after ?? '—'}
      </span>
    </div>
  );
}
