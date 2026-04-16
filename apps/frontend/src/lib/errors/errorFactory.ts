/**
 * Error Factory Utilities
 *
 * Helper functions for error creation, normalization, and message resolution.
 * @module lib/errors/errorFactory
 */

// =============================================================================
// MESSAGE NORMALIZATION
// =============================================================================

const MESSAGE_CANDIDATE_KEYS = [
  "message",
  "error",
  "error_description",
  "detail",
  "title",
  "description",
  "reason",
] as const;

interface NormalizedMessageResult {
  value: string;
  found: boolean;
}

function normalizePrimitiveValue(
  value: unknown,
  fallback: string
): NormalizedMessageResult | null {
  if (value === undefined || value === null) {
    return { value: fallback, found: false };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "[object Object]") {
      return { value: fallback, found: false };
    }
    return { value: trimmed, found: true };
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return { value: String(value), found: true };
  }

  return null;
}

function normalizeErrorInstance(
  error: Error,
  fallback: string,
  seen: WeakSet<object>
): NormalizedMessageResult {
  const messageResult = normalizeErrorMessage(error.message, fallback, seen);
  if (messageResult.found) {
    return messageResult;
  }

  if ("cause" in error && (error as { cause?: unknown }).cause !== undefined) {
    const causeResult = normalizeErrorMessage(
      (error as { cause?: unknown }).cause,
      fallback,
      seen
    );
    if (causeResult.found) {
      return causeResult;
    }
  }

  return { value: fallback, found: false };
}

function normalizeObjectValue(
  value: Record<string, unknown>,
  fallback: string,
  seen: WeakSet<object>
): NormalizedMessageResult {
  if (seen.has(value)) {
    return { value: fallback, found: false };
  }
  seen.add(value);

  for (const key of MESSAGE_CANDIDATE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }

    const nestedValue = value[key];
    if (nestedValue === undefined) {
      continue;
    }

    const result = normalizeErrorMessage(nestedValue, fallback, seen);
    if (result.found) {
      return result;
    }
  }

  try {
    return {
      value: JSON.stringify(value),
      found: true,
    };
  } catch {
    return { value: fallback, found: false };
  }
}

function normalizeErrorMessage(
  value: unknown,
  fallback: string,
  seen = new WeakSet<object>()
): NormalizedMessageResult {
  const primitiveResult = normalizePrimitiveValue(value, fallback);
  if (primitiveResult) {
    return primitiveResult;
  }

  if (value instanceof Error) {
    return normalizeErrorInstance(value, fallback, seen);
  }

  if (typeof value === "object" && value !== null) {
    return normalizeObjectValue(
      value as Record<string, unknown>,
      fallback,
      seen
    );
  }

  return { value: String(value), found: true };
}

/**
 * Resolve error message from multiple sources
 *
 * @param fallback - Default message if no valid message found
 * @param sources - Potential error message sources to check
 * @returns Resolved error message
 */
export function resolveErrorMessage(
  fallback: string,
  ...sources: unknown[]
): string {
  for (const source of sources) {
    const { value, found } = normalizeErrorMessage(source, fallback);
    if (found) {
      return value;
    }
  }
  return fallback;
}
