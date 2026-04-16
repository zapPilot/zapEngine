/**
 * className Utility Functions
 * Replaces inline ternary operators with cleaner conditional API
 */

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
