/**
 * Serializes Error objects for Winston logging.
 *
 * Error objects have non-enumerable properties (message, stack, name)
 * which causes them to serialize as {} in JSON logs. This utility
 * extracts all relevant error information into a plain object.
 *
 * @param error - Error to serialize (Error, APIError, or unknown)
 * @returns Plain object with error details suitable for logging
 *
 * @example
 * ```typescript
 * try {
 *   await fetchData();
 * } catch (error) {
 *   logger.error('Fetch failed', serializeError(error));
 * }
 * ```
 */
type KnownError = Error & {
  statusCode?: number;
  url?: string;
  source?: string;
  operation?: string;
  field?: string;
  value?: unknown;
  record?: unknown;
};

function setIfDefined(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function serializeKnownError(error: KnownError): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    message: error.message,
    name: error.name,
    stack: error.stack,
  };

  setIfDefined(serialized, 'statusCode', error.statusCode);
  setIfDefined(serialized, 'url', error.url);
  setIfDefined(serialized, 'source', error.source);
  setIfDefined(serialized, 'operation', error.operation);
  setIfDefined(serialized, 'field', error.field);
  setIfDefined(serialized, 'value', error.value);
  setIfDefined(serialized, 'record', error.record);

  // Handle Error.cause (ES2022 feature) - recursively serialize
  if (error.cause) {
    serialized['cause'] = serializeError(error.cause);
  }

  return serialized;
}

function serializeObjectError(error: object): Record<string, unknown> {
  const obj = error as Record<string, unknown>;
  const serialized: Record<string, unknown> = {};

  setIfDefined(serialized, 'message', obj['message']);
  setIfDefined(serialized, 'name', obj['name']);
  setIfDefined(serialized, 'code', obj['code']);
  setIfDefined(serialized, 'type', obj['type']);

  return Object.keys(serialized).length > 0
    ? serialized
    : { error: 'Unknown error object', raw: String(error) };
}

export function serializeError(error: unknown): Record<string, unknown> {
  // Handle null/undefined (but not other falsy values like 0, '', false)
  if (error === null || error === undefined) {
    return { error: 'Unknown error (null/undefined)' };
  }

  // Handle Error instances (including APIError, DatabaseError, etc.)
  if (error instanceof Error) {
    return serializeKnownError(error as KnownError);
  }

  // Handle non-Error objects (fetch API errors, plain objects)
  if (typeof error === 'object') {
    try {
      return serializeObjectError(error);
    } catch {
      return { error: 'Error serialization failed', raw: String(error) };
    }
  }

  // Handle primitives (string, number, boolean, etc.)
  return { error: String(error) };
}
