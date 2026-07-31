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

function markerLabel(event: StrategyEvent): string {
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
