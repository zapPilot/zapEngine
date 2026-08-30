import { ServiceLayerException } from '../exceptions';
import { getErrorMessage } from './error-message.util';

/** Node fetch timeouts surface with "timeout" or "timed out" in the message. */
export function isRetryableTimeoutError(error: unknown): boolean {
  if (error instanceof ServiceLayerException) {
    return false;
  }

  const message = getErrorMessage(error).toLowerCase();
  return message.includes('timeout') || message.includes('timed out');
}

export async function retryOnceOnTimeout<T>(
  operation: () => Promise<T>,
  onRetry?: (error: unknown) => void,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isRetryableTimeoutError(error)) {
      throw error;
    }

    onRetry?.(error);
    return operation();
  }
}
