/**
 * Shared env-var validation helpers.
 *
 * `portSchema` is the canonical TCP port range used by every Node service in
 * the monorepo when validating `*_PORT` env vars. Apps wrap it in their own
 * string-default/transform chains as needed.
 */

import { z } from 'zod';

export const portSchema = z.coerce.number<string>().int().min(1).max(65535);

/** Trim an optional environment value, treating blank strings as unset. */
export function trimToUndefined(
  value: string | null | undefined,
): string | undefined {
  return value?.trim() || undefined;
}
