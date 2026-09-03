const DAY_MS = 86_400_000;
const HOUR_MS = 60 * 60 * 1000;
const PRIOR_BLEND_DAYS = 7;

export function currentUtcPeriod(now: Date): {
  periodStart: string;
  periodEnd: string;
} {
  return {
    periodStart: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString(),
    periodEnd: now.toISOString(),
  };
}

/**
 * Projects month-to-date spend to a month-end figure, damped by the previous
 * calendar month when the caller can supply it.
 *
 * A pure linear extrapolation of month-to-date spend is unusable in the first
 * days of a month: 9.5 hours of OpenRouter usage on the 1st ($0.13, read at
 * 09:31 UTC) extrapolates to $9.67 because the multiplier is ~75x. The only
 * stable prior available is our own ledger's total for the previous month, so
 * early in the month the daily rate is a blend of the observed rate and the
 * prior month's daily rate, with the observed rate's weight rising linearly to
 * 1 over the first `PRIOR_BLEND_DAYS`.
 *
 * Three properties this shape is chosen for:
 *
 * - `value + (value / elapsedDays) * (monthDays - elapsedDays)` is
 *   algebraically identical to `value * monthDays / elapsedDays`, so the
 *   no-prior path is exactly the legacy extrapolation and callers without a
 *   ledger see no behaviour change.
 * - At `elapsedDays === PRIOR_BLEND_DAYS` the blend weight is exactly 1, so
 *   both branches agree and the function is continuous at the seam. Past that
 *   day the prior contributes nothing.
 * - The `value === 0` short-circuit survives only on the no-prior path. With a
 *   known prior, a month whose first sync lands before any usage is recorded is
 *   not a month with no spend, so zero month-to-date still projects from the
 *   prior's daily rate and decays to 0 by the seam if usage really stays 0.
 *   Special-casing zero there would make the result discontinuous in `value`.
 *
 * Month lengths come from UTC month boundaries rather than a hardcoded 30, so
 * February and leap years are correct, and the prior's daily rate is divided by
 * the prior month's own length.
 *
 * @param priorMonthTotalUsd Previous calendar month's total for this provider,
 * taken from the caller's own persisted ledger. A prior of 0 is real data (the
 * provider genuinely spent nothing) and damps the early projection; omitting it
 * or passing null means "no data" and falls back to linear extrapolation.
 */
export function projectMonthEnd(
  value: number,
  now: Date,
  priorMonthTotalUsd?: number | null,
): number {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const monthStart = Date.UTC(year, month, 1);
  const nextMonthStart = Date.UTC(year, month + 1, 1);
  const priorMonthStart = Date.UTC(year, month - 1, 1);
  const monthDays = (nextMonthStart - monthStart) / DAY_MS;
  const priorMonthDays = (monthStart - priorMonthStart) / DAY_MS;
  // A sync minutes after midnight on the 1st would otherwise divide by ~0.
  const elapsedDays = Math.max(now.getTime() - monthStart, HOUR_MS) / DAY_MS;
  const remainingDays = Math.max(0, monthDays - elapsedDays);

  const hasPrior =
    typeof priorMonthTotalUsd === 'number' &&
    Number.isFinite(priorMonthTotalUsd) &&
    priorMonthTotalUsd >= 0;
  if (!hasPrior) {
    if (value === 0) {
      return 0;
    }
    return roundUsd(value + (value / elapsedDays) * remainingDays);
  }

  const observedWeight = Math.min(1, elapsedDays / PRIOR_BLEND_DAYS);
  const dailyRate =
    observedWeight * (value / elapsedDays) +
    (1 - observedWeight) * (priorMonthTotalUsd / priorMonthDays);
  return roundUsd(value + dailyRate * remainingDays);
}

export function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}
