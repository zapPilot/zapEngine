import {
  MarketDashboardResponseSchema,
  type MarketDashboardResponse,
} from '@zapengine/types/api';

import artifact from './market-signals.json';

export interface MarketSignalPoint {
  date: string;
  value: number;
}

export interface MarketDmaPoint extends MarketSignalPoint {
  dma: number | null;
}

export interface MarketGaugePoint extends MarketSignalPoint {
  regime: string | null;
}

let cachedSignals: MarketDashboardResponse | null | undefined;

type DashboardPoint =
  MarketDashboardResponse['snapshots'][number]['values'][string];

export function getMarketSignals(): MarketDashboardResponse | null {
  if (cachedSignals !== undefined) return cachedSignals;
  const parsed = MarketDashboardResponseSchema.safeParse(artifact);
  cachedSignals = parsed.success ? parsed.data : null;
  return cachedSignals;
}

export function seriesWithDma(
  signals: MarketDashboardResponse,
  id: string,
): MarketDmaPoint[] {
  return mapSeries(signals, id, (date, point) => ({
    date,
    value: point.value,
    dma: point.indicators['dma_200']?.value ?? null,
  }));
}

export function gaugeSeries(
  signals: MarketDashboardResponse,
  id: string,
): MarketGaugePoint[] {
  return mapSeries(signals, id, (date, point) => ({
    date,
    value: point.value,
    regime: point.tags['regime'] ?? null,
  }));
}

function mapSeries<T>(
  signals: MarketDashboardResponse,
  id: string,
  mapPoint: (date: string, point: DashboardPoint) => T,
): T[] {
  return signals.snapshots.flatMap((snapshot) => {
    const point = snapshot.values[id];
    return point ? [mapPoint(snapshot.snapshot_date, point)] : [];
  });
}

export function signalsAsOf(signals: MarketDashboardResponse): string {
  return signals.snapshots.at(-1)?.snapshot_date ?? '';
}
