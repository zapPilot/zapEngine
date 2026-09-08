import type { OperationalStatus } from '../shared/types.js';

function currencyWithRange(
  value: number | null | undefined,
  minFraction: number,
  maxFraction: number,
): string {
  return value === null || value === undefined
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: minFraction,
        maximumFractionDigits: maxFraction,
      }).format(value);
}

function currency(
  value: number | null | undefined,
  fractionDigits: number,
): string {
  return currencyWithRange(value, fractionDigits, fractionDigits);
}

export function usd(value: number | null | undefined): string {
  return currency(value, 2);
}

/**
 * Money at a glance. Cents are noise in a headline figure and they are what
 * pushed "$179,612.34" past its column into "$179,6…"; the exact amount stays
 * one click away in Economics.
 */
export function usdWhole(value: number | null | undefined): string {
  return currency(value, 0);
}

/**
 * A headline figure shrinks rather than clips. A twenty-five digit AUM is a
 * broken feed telling on itself, and the old strip hid exactly that by
 * ellipsising it to "−$26,963,…".
 */
export function headlineScale(value: string): string {
  return value.length > 12 ? 'long' : '';
}

export function unitUsd(value: number | null | undefined): string {
  return currencyWithRange(value, 2, 4);
}

export function integer(value: number | null | undefined): string {
  return value === null || value === undefined
    ? '—'
    : new Intl.NumberFormat('en-US').format(value);
}

export function percent(value: number | null | undefined): string {
  return value === null || value === undefined
    ? '—'
    : `${(value * 100).toFixed(1)}%`;
}

export function duration(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }
  const roundedSeconds = Math.round(value);
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, '0')}`
    : `${seconds}s`;
}

export function relativeTime(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return 'Unknown';
  }
  const elapsed = Date.now() - parsed;
  if (elapsed <= -60_000) {
    return elapsed > -60 * 60_000
      ? `in ${Math.ceil(-elapsed / 60_000)} min`
      : new Date(parsed).toLocaleString();
  }
  if (elapsed < 60_000) {
    return 'just now';
  }
  if (elapsed < 60 * 60_000) {
    return `${Math.floor(elapsed / 60_000)} min ago`;
  }
  return new Date(parsed).toLocaleString();
}

/** One line of an error, whatever the stack underneath it looked like. Raw
 * provider errors arrive with embedded newlines and multi-kilobyte bodies that
 * would push every other fact on the card off the screen. */
export function compactError(error: string): string {
  const compact = error.replace(/\s+/gu, ' ').trim();
  if (compact.length > 280) {
    return `${compact.slice(0, 277)}…`;
  }
  return compact;
}

export function providerUsage(unit: 'usd' | 'units', value: number): string {
  return unit === 'usd' ? usd(value) : `${integer(value)} units`;
}

export function filterKnownAccruedCost<
  T extends { accruedCostUsd: number | null },
>(points: T[]): (T & { accruedCostUsd: number })[] {
  return points.filter(
    (point): point is T & { accruedCostUsd: number } =>
      point.accruedCostUsd !== null,
  );
}

export function statusLabel(status: OperationalStatus | undefined): string {
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
}

export function daysAgo(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'never';
  }
  return value === 0 ? 'today' : `${integer(value)}d ago`;
}

export function hoursAgo(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'never';
  }
  return value < 48 ? `${Math.round(value)}h` : `${Math.round(value / 24)}d`;
}
