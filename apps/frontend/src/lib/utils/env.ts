/**
 * Environment variable utility functions
 */

/**
 * Converts an environment variable string to seconds, with a fallback value.
 *
 * @param value - The environment variable value to parse
 * @param fallback - The fallback value if parsing fails or value is undefined
 * @returns The parsed number of seconds, or the fallback
 *
 * @example
 * ```ts
 * const maxAge = toSeconds("3600", 3600);
 * ```
 */
export function toSeconds(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
