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

export const AXIS_COLOR = '#9CA3AF';

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

export function formatRatioLabel(val: number): string {
  return Number(val).toFixed(4);
}

export function formatRatioValue(val: number | null | undefined): string {
  return val == null ? '---' : Number(val).toFixed(4);
}
