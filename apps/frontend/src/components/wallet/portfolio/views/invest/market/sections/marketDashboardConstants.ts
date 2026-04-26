import { REGIME_LABELS } from '@/lib/domain/regimeMapper';

/** Regime hex colors keyed by short RegimeId (ef/f/n/g/eg) */
export const REGIME_COLORS: Record<string, string> = {
  ef: '#ef4444',
  f: '#f97316',
  n: '#eab308',
  g: '#84cc16',
  eg: '#22c55e',
};

export const TIMEFRAMES = [
  { id: '1M', days: 30 },
  { id: '3M', days: 90 },
  { id: '1Y', days: 365 },
  { id: 'MAX', days: 1900 },
] as const;

export type Timeframe = (typeof TIMEFRAMES)[number]['id'];

/**
 * Subset of TIMEFRAMES surfaced in the unified market dashboard picker.
 * 1M/3M are dropped here because they do not give enough history for
 * 200-day moving-average crossover analysis (the dashboard's primary use case).
 */
export const MARKET_VIEW_TIMEFRAMES: readonly {
  id: Timeframe;
  days: number;
}[] = TIMEFRAMES.filter((tf) => tf.id === '1Y' || tf.id === 'MAX');

/** Maximum number of days requested from the backend in a single fetch. */
export const MARKET_VIEW_MAX_DAYS = 1900;

export const AXIS_COLOR = '#9CA3AF';

/** Identifier for each toggleable line in the unified market chart. */
export const MARKET_LINE_KEYS = [
  'btcPrice',
  'btcDma200',
  'ethBtcRatio',
  'ethBtcDma200',
  'spyPrice',
  'spyDma200',
  'fgi',
] as const;

export type MarketLineKey = (typeof MARKET_LINE_KEYS)[number];

export type MarketLineAxis = 'price' | 'ratio' | 'fgi';

export interface MarketLineDescriptor {
  key: MarketLineKey;
  /** Legend pill label (matches the recharts Line `name` for tooltip lookup). */
  label: string;
  color: string;
  /** Which Y-axis this series renders against. */
  axis: MarketLineAxis;
  /** Whether this line is visible by default on first render. */
  defaultActive: boolean;
}

/**
 * Descriptors for every line the market dashboard can show.
 *
 * Keep the order stable — it determines pill order in the legend AND
 * z-order in the chart (later items render on top).
 */
export const MARKET_LINES: readonly MarketLineDescriptor[] = [
  {
    key: 'btcPrice',
    label: 'BTC Price',
    color: AXIS_COLOR,
    axis: 'price',
    defaultActive: true,
  },
  {
    key: 'btcDma200',
    label: 'BTC 200 DMA',
    color: '#A855F7',
    axis: 'price',
    defaultActive: true,
  },
  {
    key: 'ethBtcRatio',
    label: 'ETH/BTC Ratio',
    color: '#34D399',
    axis: 'ratio',
    defaultActive: false,
  },
  {
    key: 'ethBtcDma200',
    label: 'ETH/BTC 200 DMA',
    color: '#F59E0B',
    axis: 'ratio',
    defaultActive: false,
  },
  {
    key: 'spyPrice',
    label: 'SPY Price',
    color: '#3B82F6',
    axis: 'price',
    defaultActive: false,
  },
  {
    key: 'spyDma200',
    label: 'SPY 200 DMA',
    color: '#EC4899',
    axis: 'price',
    defaultActive: false,
  },
  {
    key: 'fgi',
    label: 'Fear & Greed Index',
    color: '#10B981',
    axis: 'fgi',
    defaultActive: true,
  },
] as const;

export const DEFAULT_ACTIVE_LINES: ReadonlySet<MarketLineKey> = new Set(
  MARKET_LINES.filter((line) => line.defaultActive).map((line) => line.key),
);

export function getRegimeColor(
  regime: string | null | undefined,
  fallback = '#eab308',
): string {
  if (!regime || !(regime in REGIME_COLORS)) return fallback;
  return REGIME_COLORS[regime] ?? fallback;
}

export function getRegimeLabel(regime: string | null | undefined): string {
  return regime && regime in REGIME_LABELS
    ? REGIME_LABELS[regime as keyof typeof REGIME_LABELS]
    : '';
}

export function formatXAxisDate(val: string): string {
  const d = new Date(val);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatRatioValue(val: number | null | undefined): string {
  return val == null ? '---' : Number(val).toFixed(4);
}

export function formatPriceLabel(val: number): string {
  return `$${Math.round(val / 1000)}k`;
}
