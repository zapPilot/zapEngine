export function normalizeNonNegative(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function roundUsageUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
