/**
 * Type guard: true iff value is a finite number (not NaN, not ±Infinity).
 *
 * Use as a shared predicate for "should we treat this as a usable numeric value?"
 * (subject-line formatting, percentage calculations, contract payload checks).
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Percent change between two values: `((latest - baseline) / baseline) * 100`.
 *
 * Returns `null` if either input is not a finite number, or if the baseline is
 * non-positive (avoids divide-by-zero AND avoids meaningless negative-baseline
 * percentages — the existing financial use-case here is portfolio balances,
 * which we treat as $0 → baseline-undefined).
 *
 * Use this when comparing two snapshots of the same metric (e.g., portfolio
 * value now vs. 7 days ago).
 */
export function percentChange(
  latest: unknown,
  baseline: unknown,
): number | null {
  if (!isFiniteNumber(latest) || !isFiniteNumber(baseline)) {
    return null;
  }
  if (baseline <= 0) {
    return null;
  }
  return ((latest - baseline) / baseline) * 100;
}
