import type { MarketDashboardResponse } from '@zapengine/app-core/services/analyticsService';

export type TrendSignalId = 'btc' | 'eth' | 'spy' | 'eth_btc';
export type SentimentSignalId = 'fgi' | 'macro_fear_greed';
export type SignalRegime =
  | 'extreme_fear'
  | 'fear'
  | 'neutral'
  | 'greed'
  | 'extreme_greed';
export type SignalRange = '3M' | '6M' | '1Y';

export const SIGNAL_RANGES: readonly SignalRange[] = ['3M', '6M', '1Y'];
export const MARKET_SIGNALS_DAYS = 365;

const TREND_IDS: readonly TrendSignalId[] = ['btc', 'eth', 'spy', 'eth_btc'];
const SENTIMENT_IDS: readonly SentimentSignalId[] = ['fgi', 'macro_fear_greed'];
const RANGE_DAYS: Readonly<Record<SignalRange, number>> = {
  '3M': 90,
  '6M': 180,
  '1Y': MARKET_SIGNALS_DAYS,
};
const REGIMES: readonly SignalRegime[] = [
  'extreme_fear',
  'fear',
  'neutral',
  'greed',
  'extreme_greed',
];
// Crypto F&G arrives as RegimeId short codes, macro F&G as provider labels.
const REGIME_CODES: Readonly<Record<string, SignalRegime>> = {
  ef: 'extreme_fear',
  f: 'fear',
  n: 'neutral',
  g: 'greed',
  eg: 'extreme_greed',
};

export interface TrendSignal {
  id: TrendSignalId;
  latestDate: string;
  latest: number;
  dma: number | null;
  /** latest / dma − 1. */
  distance: number | null;
  isAbove: boolean | null;
  /** First day of the current above/below run; null when the run spans the whole window. */
  sideSince: string | null;
  dates: string[];
  values: number[];
  dmaValues: (number | null)[];
}

export interface SentimentSignal {
  id: SentimentSignalId;
  latestDate: string;
  latest: number;
  regime: SignalRegime | null;
  previousRegime: SignalRegime | null;
  /** First day of the current regime run; null when it spans the whole window. */
  regimeSince: string | null;
  dates: string[];
  values: number[];
}

export interface MarketSignals {
  asOf: string;
  trends: TrendSignal[];
  sentiments: SentimentSignal[];
}

export function marketSignalsFromDashboard(
  dashboard: MarketDashboardResponse | undefined,
): MarketSignals | null {
  const lastSnapshot = dashboard?.snapshots.at(-1);
  if (!dashboard || !lastSnapshot) return null;
  const trends = TREND_IDS.flatMap((id) => {
    const signal = trendSignal(dashboard, id);
    return signal ? [signal] : [];
  });
  const sentiments = SENTIMENT_IDS.flatMap((id) => {
    const signal = sentimentSignal(dashboard, id);
    return signal ? [signal] : [];
  });
  if (trends.length === 0 && sentiments.length === 0) return null;
  return { asOf: lastSnapshot.snapshot_date, trends, sentiments };
}

/** Index of the first point to chart for `range`, counted back from the latest date. */
export function signalWindowStart(dates: string[], range: SignalRange): number {
  const latest = dates.at(-1);
  if (!latest) return 0;
  const cutoff = shiftIsoDate(latest, -RANGE_DAYS[range]);
  const start = dates.findIndex((date) => date > cutoff);
  return start === -1 ? 0 : start;
}

export function normalizeSignalRegime(
  raw: string | undefined,
): SignalRegime | null {
  if (!raw) return null;
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const fromCode = REGIME_CODES[key];
  if (fromCode) return fromCode;
  return REGIMES.find((regime) => regime === key) ?? null;
}

function trendSignal(
  dashboard: MarketDashboardResponse,
  id: TrendSignalId,
): TrendSignal | null {
  const points = dashboard.snapshots.flatMap((snapshot) => {
    const point = snapshot.values[id];
    if (!point) return [];
    const dma = point.indicators['dma_200'];
    const dmaValue = dma?.value ?? null;
    return [
      {
        date: snapshot.snapshot_date,
        value: point.value,
        dma: dmaValue,
        isAbove:
          dma?.is_above ?? (dmaValue === null ? null : point.value >= dmaValue),
      },
    ];
  });
  const latest = points.at(-1);
  if (!latest) return null;
  const runStart = runStartIndex(points, (point) => point.isAbove);
  return {
    id,
    latestDate: latest.date,
    latest: latest.value,
    dma: latest.dma,
    distance: latest.dma ? latest.value / latest.dma - 1 : null,
    isAbove: latest.isAbove,
    sideSince:
      latest.isAbove === null || runStart === 0 ? null : points[runStart]!.date,
    dates: points.map((point) => point.date),
    values: points.map((point) => point.value),
    dmaValues: points.map((point) => point.dma),
  };
}

function sentimentSignal(
  dashboard: MarketDashboardResponse,
  id: SentimentSignalId,
): SentimentSignal | null {
  const points = dashboard.snapshots.flatMap((snapshot) => {
    const point = snapshot.values[id];
    return point
      ? [
          {
            date: snapshot.snapshot_date,
            value: point.value,
            regime: normalizeSignalRegime(point.tags['regime']),
          },
        ]
      : [];
  });
  const latest = points.at(-1);
  if (!latest) return null;
  const runStart = runStartIndex(points, (point) => point.regime);
  return {
    id,
    latestDate: latest.date,
    latest: latest.value,
    regime: latest.regime,
    previousRegime: runStart > 0 ? points[runStart - 1]!.regime : null,
    regimeSince:
      latest.regime === null || runStart === 0 ? null : points[runStart]!.date,
    dates: points.map((point) => point.date),
    values: points.map((point) => point.value),
  };
}

function runStartIndex<T, K>(points: T[], key: (point: T) => K): number {
  const current = key(points.at(-1)!);
  let start = points.length - 1;
  while (start > 0 && key(points[start - 1]!) === current) start -= 1;
  return start;
}

function shiftIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
