/**
 * Age of a timestamp in milliseconds, or null when there is no reading.
 *
 * Null and unparseable both mean "we have never been told", which is a
 * different fact from "zero milliseconds ago": clamping to zero is how a
 * wallet nothing has ever refreshed reads as freshly refreshed. Negative
 * elapsed time is clamped, though, because a stamp slightly ahead of `now` is
 * clock skew rather than a reading from the future.
 */
export function elapsedMs(value: string | null, now: Date): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : Math.max(0, now.getTime() - parsed);
}
