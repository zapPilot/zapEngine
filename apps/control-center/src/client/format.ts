import type { OperationalStatus } from '../shared/types.js';

export function usd(value: number | null | undefined): string {
  return value === null || value === undefined
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
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
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, '0')}`
    : `${seconds}s`;
}

export function relativeTime(value: string): string {
  const elapsed = Date.now() - Date.parse(value);
  if (elapsed < 60_000) {
    return 'just now';
  }
  if (elapsed < 60 * 60_000) {
    return `${Math.floor(elapsed / 60_000)} min ago`;
  }
  return new Date(value).toLocaleString();
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
