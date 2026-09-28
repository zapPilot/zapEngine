import { useId } from 'react';
import { MarkerGlyph } from '@/components/track-record/chartMarkers';
import { distancePercent } from '@/lib/verifiable-strategy/encoding';
import type {
  AssetView,
  CalculatorInput,
} from '@/lib/verifiable-strategy/types';

export function AssetCrossTrack({
  asset,
  previous,
  current,
  view,
}: {
  asset: string;
  previous: CalculatorInput['current'][number];
  current: CalculatorInput['current'][number];
  view?: AssetView;
}) {
  const id = useId();
  const before = distancePercent(previous),
    after = distancePercent(current);
  // Float conversion is confined to SVG positioning, after exact input formatting.
  const numeric = (value: string | null) =>
    value === null ? 0 : parseFloat(value.replace('−', '-'));
  const extent = Math.max(
    6,
    Math.abs(numeric(before)),
    Math.abs(numeric(after)),
  );
  const position = (value: string | null) =>
    150 + (numeric(value) * 120) / extent;
  const x1 = position(before),
    x2 = position(after);
  return (
    <div
      className="track-record-calculator-track"
      style={{ color: `var(--event-${asset.toLowerCase()})` }}
    >
      <div>
        <strong>{asset}</strong>
        <span>
          Yesterday {before ?? 'missing'} → Today {after ?? 'missing'}
        </span>
      </div>
      <svg
        viewBox="0 0 300 42"
        role="img"
        aria-label={`${asset}: yesterday ${before ?? 'missing'}, today ${after ?? 'missing'} relative to 200-day average`}
      >
        <defs>
          <marker
            id={id}
            viewBox="0 0 6 6"
            refX="5"
            refY="3"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0 0L6 3L0 6" fill="none" stroke="currentColor" />
          </marker>
        </defs>
        <line x1="10" x2="290" y1="22" y2="22" className="track-baseline" />
        <line x1="150" x2="150" y1="4" y2="40" className="track-average" />
        {before !== null && after !== null && (
          <line
            x1={x1}
            x2={x2}
            y1="22"
            y2="22"
            stroke="currentColor"
            strokeWidth="2"
            markerEnd={`url(#${id})`}
          />
        )}
        {before !== null && (
          <circle
            cx={x1}
            cy="22"
            r="5"
            fill="var(--bg)"
            stroke="currentColor"
            strokeWidth="2"
          />
        )}
        {after !== null && <circle cx={x2} cy="22" r="5" fill="currentColor" />}
      </svg>
      <small>Center line: 200-day average. Input visualization only.</small>
      {view && (
        <span className="track-record-calculator-cross">
          {view.cross === 1 && <MarkerGlyph action="sell" />}Contract:{' '}
          {['missing', 'above', 'below', 'at'][view.zone]}
          {view.cross === 1
            ? ' — crossed below'
            : view.cross === 2
              ? ' — crossed above'
              : ' — no cross'}
        </span>
      )}
    </div>
  );
}
