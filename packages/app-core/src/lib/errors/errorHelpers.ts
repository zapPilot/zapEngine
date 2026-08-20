import type { ServiceError } from './ServiceError';

/**
 * Extract a human-readable message from an unknown error object.
 *
 * @param error - Error-like value to inspect
 * @param fallbackMessage - Message to return when no usable message exists;
 *   defaults to the stringified error
 * @returns Resolved error message string
 */
export function extractErrorMessage(
  error: unknown,
  fallbackMessage = String(error),
): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return fallbackMessage;
}

interface ErrorWithStatus {
  status?: number;
}

/**
 * Check if error is a client error (4xx status code)
 *
 * @param error - Error object to check
 * @returns True if error has 4xx status code
 */
export function isClientError(error: unknown): boolean {
  const status = getErrorStatus(error);
  return typeof status === 'number' && status >= 400 && status < 500;
}

/**
 * Type guard to check if error is a ServiceError instance
 *
 * @param error - Error to check
 * @returns True if error is ServiceError
 */
function isServiceError(error: unknown): error is ServiceError {
  return (
    error instanceof Error &&
    'status' in error &&
    typeof (error as ServiceError).status === 'number'
  );
}

function getErrorStatus(error: unknown): number | undefined {
  if (isServiceError(error)) {
    return error.status;
  }

  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as ErrorWithStatus).status;
    if (typeof status === 'number') return status;
  }

  return undefined;
}
