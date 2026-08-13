/**
 * Type guard: true iff value is a finite number (not NaN, not ±Infinity).
 *
 * Shared predicate for "should we treat this as a usable numeric value?"
 * (subject-line formatting, percentage calculations, contract payload checks).
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
