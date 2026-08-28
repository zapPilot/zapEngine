/**
 * Sum the values we actually have, or report that we have none.
 *
 * Nulls are absences, not zeroes: a provider that has never reported and a
 * provider that reported nothing are different facts, and folding the first
 * into `0` is how an unconfigured integration turns into a confident "$0" on
 * a costs page. An all-null set therefore stays null all the way to the UI,
 * which renders it as an em dash.
 */
export function sumKnown(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}
