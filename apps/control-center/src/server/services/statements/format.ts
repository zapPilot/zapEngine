import type { MetricSeries } from '../metric-snapshots.js';
import type { RuleTone } from './types.js';

export function money(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function count(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  return value.toLocaleString('en-US');
}

export function percent(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  return `${(value * 100).toFixed(digits)}%`;
}

export function signedPercent(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  const pct = value * 100;
  const sign = pct > 0 ? '+' : pct < 0 ? '' : '±';
  return `${sign}${pct.toFixed(digits)}%`;
}

export function signedCount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  if (value === 0) {
    return '±0';
  }
  return `${value > 0 ? '+' : '-'}${count(Math.abs(value))}`;
}

/** `elapsedMinutes` is honest age from a live source (e.g. Fly's own
 * `updated_at`), never a fabricated one — callers omit the clause entirely
 * when this returns null. */
export function elapsedFromMinutes(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes)) {
    return null;
  }
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) {
    return `${whole}m`;
  }
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

export function plural(
  value: number,
  word: string,
  pluralForm?: string,
): string {
  return value === 1 ? word : (pluralForm ?? `${word}s`);
}

/**
 * A metric's sparkline + Δ7d, reading straight from `ops.metric_snapshots`.
 * Degrades to "collecting (n/7)" — never a fabricated trend — until eight
 * dated points exist for the key.
 */
export function seriesAndDelta(
  metricSeries: Map<string, MetricSeries>,
  key: string,
  tone: (delta: number) => RuleTone,
  digits = 0,
): { series: number[]; delta: string; deltaTone: RuleTone } {
  const entry = metricSeries.get(key);
  if (!entry || entry.delta7d === null) {
    const have = Math.min(entry?.rowCount ?? 0, 7);
    return {
      series: entry?.series ?? [],
      delta: `collecting (${have}/7)`,
      deltaTone: 'neutral',
    };
  }
  const sign = entry.delta7d > 0 ? '+' : entry.delta7d < 0 ? '' : '±';
  return {
    series: entry.series,
    delta: `${sign}${entry.delta7d.toFixed(digits)} · 7d`,
    deltaTone: tone(entry.delta7d),
  };
}
