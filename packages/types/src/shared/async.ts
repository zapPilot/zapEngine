/**
 * Resolve after `ms` milliseconds. Used by retry/backoff loops and polling.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
