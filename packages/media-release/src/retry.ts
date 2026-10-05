/** Shared bounded-retry budget for R2 uploads and public artifact checks. */
export function resolveAttempts(
  value: number | undefined,
  fallback: number,
): number {
  const attempts = value ?? fallback;
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error('attempts must be positive');
  }
  return attempts;
}
