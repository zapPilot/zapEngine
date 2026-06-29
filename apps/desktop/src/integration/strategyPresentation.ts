import type { CompositionTarget } from '@/integration/useStrategySuggestion';

interface WeightedPillar {
  label: string;
  weight: number;
  color: string;
}

interface AllocationSlice {
  label: string;
  pct: number;
  color: string;
}

export function liveNumberOrDemo(
  value: unknown,
  demoValue: number | null,
  isDemo: boolean,
): number | null {
  if (typeof value === 'number') {
    return value;
  }
  return isDemo ? demoValue : null;
}

export function liveTextOrDemo(
  value: string | null | undefined,
  demoValue: string,
  isDemo: boolean,
): string {
  return value ?? (isDemo ? demoValue : '—');
}

export function demoTextOrDash(
  demoValue: string,
  isDemo: boolean,
  fallback = '—',
): string {
  return isDemo ? demoValue : fallback;
}

export function marketModeLabelFor(
  regimeLabel: string,
  demoLabel: string,
  isDemo: boolean,
): string {
  if (regimeLabel) {
    return `Market mode · ${regimeLabel}`;
  }
  return isDemo ? demoLabel : 'Market mode · —';
}

export function currentModeLabelFor(
  regimeLabel: string,
  demoLabel: string,
  isDemo: boolean,
): string {
  if (regimeLabel) {
    return regimeLabel;
  }
  return demoTextOrDash(demoLabel, isDemo);
}

function emptyPillars(): WeightedPillar[] {
  return [
    { label: 'Equities', weight: 0, color: 'var(--spy)' },
    { label: 'Crypto', weight: 0, color: 'var(--btc)' },
    { label: 'Stables', weight: 0, color: 'var(--usd)' },
  ];
}

export function pillarsFromTarget<T extends WeightedPillar>(
  target: CompositionTarget | null,
  demoPillars: T[],
  isDemo: boolean,
): T[] {
  if (target) {
    return [
      { label: 'Equities', weight: target.equities, color: 'var(--spy)' },
      { label: 'Crypto', weight: target.crypto, color: 'var(--btc)' },
      { label: 'Stables', weight: target.stables, color: 'var(--usd)' },
    ] as T[];
  }
  return isDemo ? demoPillars : (emptyPillars() as T[]);
}

function emptyAllocation(): AllocationSlice[] {
  return [
    { label: 'Equities', pct: 0, color: 'var(--spy)' },
    { label: 'Crypto', pct: 0, color: 'var(--btc)' },
    { label: 'Stables', pct: 0, color: 'var(--usd)' },
  ];
}

export function allocationFromTarget<T extends AllocationSlice>(
  target: CompositionTarget | null,
  demoAllocation: T[],
  isDemo: boolean,
): T[] {
  if (target) {
    return [
      {
        label: 'Equities',
        pct: Math.round(target.equities),
        color: 'var(--spy)',
      },
      { label: 'Crypto', pct: Math.round(target.crypto), color: 'var(--btc)' },
      {
        label: 'Stables',
        pct: Math.round(target.stables),
        color: 'var(--usd)',
      },
    ] as T[];
  }
  return isDemo ? demoAllocation : (emptyAllocation() as T[]);
}
