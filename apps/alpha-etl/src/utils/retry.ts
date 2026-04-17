import { logger } from "./logger.js";
import { sleep } from "./sleep.js";

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  label?: string;
}

/**
 * Execute a function with exponential backoff retry logic.
 * Attempts start at 0 and go up to maxAttempts - 1.
 * Formula: baseDelayMs * Math.pow(2, attempt)
 *
 * @param fn - Async function to execute with retry
 * @param options - Retry configuration
 * @returns Result from the function
 * @throws Error from the function if all retries fail
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 4,
    baseDelayMs = 1000,
    maxDelayMs,
    label = "Operation",
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts - 1) {
        break;
      }

      const delayMs = Math.min(
        baseDelayMs * Math.pow(2, attempt),
        maxDelayMs ?? Infinity,
      );

      logger.warn(
        `${label} attempt ${attempt + 1}/${maxAttempts} failed, retrying`,
        {
          error: lastError.message,
          delayMs,
        },
      );

      if (delayMs > 0 && process.env.NODE_ENV !== "test") {
        await sleep(delayMs);
      }
    }
  }

  throw lastError ?? new Error(`${label} failed after ${maxAttempts} attempts`);
}
