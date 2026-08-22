/**
 * Chart legend, in up to three groups: series, asset, action.
 *
 * Extracted from the near-identical blocks NavCurveChart and BenchmarkChart
 * each carried. With two encoding channels the legend stops being decoration —
 * it is the only thing that says a green diamond means SPY rather than
 * "success", so it is not aria-hidden.
 *
 * Assets and actions render as two short groups rather than a nine-cell
 * cross-product; the reader composes "green" and "diamond" themselves.
 */
import { MARKER_ACTION_LABEL, MARKER_COLOR, MarkerGlyph } from './chartMarkers';
import type { MarkerAction, MarkerAsset } from './chartMarkers';
import { TokenIcon } from './TokenIcon';

export type ChartLegendItem =
  | {
      readonly kind: 'series';
      readonly label: string;
      readonly variant: string;
    }
  | { readonly kind: 'asset'; readonly asset: MarkerAsset }
  | { readonly kind: 'action'; readonly action: MarkerAction };

export function ChartLegend({
  items,
  className,
}: {
  items: readonly ChartLegendItem[];
  className?: string;
}) {
  const groups: ChartLegendItem['kind'][] = ['series', 'asset', 'action'];

  return (
    <div className={`chart-legend ${className ?? ''}`}>
      {groups.map((kind) => {
        const group = items.filter((item) => item.kind === kind);
        if (group.length === 0) return null;
        return (
          <span className="chart-legend-group" key={kind}>
            {group.map((item) => (
              <LegendEntry item={item} key={legendKey(item)} />
            ))}
          </span>
        );
      })}
    </div>
  );
}

function legendKey(item: ChartLegendItem): string {
  if (item.kind === 'series') return `series-${item.variant}`;
  if (item.kind === 'asset') return `asset-${item.asset}`;
  return `action-${item.action}`;
}

function LegendEntry({ item }: { item: ChartLegendItem }) {
  if (item.kind === 'series') {
    return (
      <span className={`legend-item ${item.variant}`}>
        <span />
        {item.label}
      </span>
    );
  }

  if (item.kind === 'asset') {
    return (
      <span className="legend-item asset">
        <span style={{ background: MARKER_COLOR[item.asset] }} />
        <TokenIcon symbol={item.asset} size={12} />
        {item.asset}
      </span>
    );
  }

  return (
    <span className="legend-item action">
      <MarkerGlyph action={item.action} />
      {MARKER_ACTION_LABEL[item.action]}
    </span>
  );
}
