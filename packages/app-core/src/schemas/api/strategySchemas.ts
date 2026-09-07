import { DailySuggestionResponseSchema } from '@zapengine/types/strategy';

/**
 * Zod validation for the daily strategy suggestion API response.
 *
 * Unlike its siblings in this directory this module does not build a
 * `createValidator` parser. That parser throws, and the daily suggestion is the
 * strategy card's only data source: `DailySuggestionResponseSchema` has never
 * been executed against live traffic and is stricter than the backend it
 * describes (the target allocation is `.strict()`, and it demands `alt === 0`
 * where the backend only rejects `alt > 0.001`). Rejecting here would blank the
 * card for payloads the backend considers valid.
 *
 * So the schema is used to observe drift, not to gate it. Once reports show the
 * schema matches production payloads, this can graduate to a throwing parser.
 */

/** One schema mismatch, reduced to shape only — no values ever leave here. */
export interface DailySuggestionSchemaIssue {
  /** Dotted field path, or `<root>` for a top-level mismatch. */
  path: string;
  /** Zod issue code, e.g. `unrecognized_keys`, `invalid_type`, `custom`. */
  code: string;
}

/**
 * Check a daily suggestion payload against the wire schema.
 *
 * @param data - Raw response body.
 * @returns Every mismatch found; empty when the payload matches the schema.
 */
export function findDailySuggestionSchemaIssues(
  data: unknown,
): DailySuggestionSchemaIssue[] {
  const result = DailySuggestionResponseSchema.safeParse(data);
  if (result.success) {
    return [];
  }

  return result.error.issues.map((issue) => ({
    // Paths can hold symbols, which `join` alone would throw on.
    path: issue.path.length > 0 ? issue.path.map(String).join('.') : '<root>',
    code: issue.code,
  }));
}
