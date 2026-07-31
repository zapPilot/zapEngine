/**
 * Place strategy events on a plotted series.
 *
 * The join is by date against the chart's own points, never by array index:
 * the live snapshot path can have gaps or a non-daily cadence, and taking y
 * from the series the chart actually drew is what puts a marker on the curve
 * by construction rather than by agreement between two files.
 */
import type { StrategyEvent } from '@/data/track-record-events';
import { eventAction, eventAsset } from '@/data/track-record-events';
import type { ChartMarker } from './ChartHoverLayer.client';
import { yForValue } from './chartGeometry';

export function buildChartMarkers(
  events: readonly StrategyEvent[],
  points: readonly { date: string; value: number }[],
  domainMin: number,
  domainMax: number,
): ChartMarker[] {
  const indexByDate = new Map(
    points.map((point, index) => [point.date, index]),
  );

  return events.flatMap((event): ChartMarker[] => {
    const index = indexByDate.get(event.date);
    const asset = eventAsset(event);
    if (index === undefined || asset === null) return [];

    return [
      {
        index,
        y: yForValue(points[index]!.value, domainMin, domainMax),
        asset,
        action: eventAction(event),
        label: markerLabel(event),
      },
    ];
  });
}

/**
 * One sentence per event: what moved, how much, and how much of the book that
 * was. Each measure is dropped when the source cannot supply it — the live path
 * derives events from weight deltas and has no fill amount — so the sentence
 * degrades a clause at a time instead of showing a blank or a zero.
 *
 * Assembling it here rather than in the layer keeps the tooltip and the
 * screen-reader readout reading from one string.
 */
function markerLabel(event: StrategyEvent): string {
  return [
    eventSentence(event),
    event.amountUsd === undefined ? '' : formatCompactUsd(event.amountUsd),
    event.amountPercent === undefined
      ? ''
      : `${formatWholePercent(event.amountPercent)} of portfolio`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function eventSentence(event: StrategyEvent): string {
  const sold = event.fromAssets.join(', ');
  if (event.type === 'sell') {
    return sold ? `Sold ${sold}` : 'Sold into stables';
  }
  if (event.type === 'buy') {
    return event.toAsset ? `Bought ${event.toAsset}` : 'Bought into the market';
  }
  return sold
    ? `Rotated ${sold} into ${event.toAsset}`
    : `Rotated into ${event.toAsset}`;
}

/** Three significant figures at most: the tooltip has one line for this. */
export function formatCompactUsd(amountUsd: number): string {
  const roundedDollars = Math.round(amountUsd);
  if (roundedDollars < 1_000) return `$${roundedDollars}`;

  const roundedThousands = Number((amountUsd / 1_000).toFixed(1));
  if (roundedThousands < 1_000) {
    return `$${trimTenths(roundedThousands.toFixed(1))}k`;
  }

  // Promote after rounding so boundaries never render as "$1000" or "$1000k".
  return `$${trimTenths((amountUsd / 1_000_000).toFixed(1))}M`;
}

function trimTenths(value: string): string {
  return value.endsWith('.0') ? value.slice(0, -2) : value;
}

/**
 * Whole points, because the reader is sizing a trade rather than auditing it.
 * A trade too small to reach a point is still not nothing, so it floors to
 * "<1%" instead of "0%".
 */
export function formatWholePercent(percent: number): string {
  if (percent > 0 && percent < 1) return '<1%';
  return `${Math.round(percent)}%`;
}
