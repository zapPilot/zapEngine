/**
 * Runs `fn` over `items` with at most `limit` calls in flight.
 *
 * The failure semantics are the load-bearing part: the first rejection is held
 * back until every already-started call has settled, then re-thrown. An
 * implementation that rejects immediately would leave the in-flight calls as
 * unhandled rejections — which is the one thing the `Promise.allSettled` fan-out
 * this replaces did get right.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('mapWithConcurrency limit must be a positive integer');
  }

  const results = new Array<R>(items.length);
  let cursor = 0;
  const failures: unknown[] = [];

  const worker = async (): Promise<void> => {
    // Stop pulling new work once something has failed. Workers already awaiting
    // a call are not interrupted, so every in-flight promise still settles.
    while (cursor < items.length && failures.length === 0) {
      const index = cursor++;
      try {
        results[index] = await fn(items[index]!, index);
      } catch (error) {
        failures.push(error);
        return;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );

  if (failures.length > 0) {
    throw failures[0];
  }

  return results;
}
