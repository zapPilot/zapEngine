/**
 * Message from an unknown thrown value, falling back to its string form
 * when it isn't an `Error`.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Normalize an unknown thrown value to an `Error` instance. */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
