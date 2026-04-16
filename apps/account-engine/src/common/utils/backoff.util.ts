/**
 * Calculates exponential backoff delay with jitter
 * Consolidates retry logic used across job processing
 */
import { randomInt } from 'node:crypto';

export class BackoffCalculator {
  private static readonly JITTER_PERCENTAGE = 0.1;
  private static readonly MAX_RETRY_DELAY_MS = 3_600_000;

  /**
   * Calculate exponential backoff delay with jitter
   * @param attempt - Current retry attempt (1-indexed)
   * @param baseDelay - Base delay in milliseconds
   * @returns Delay in milliseconds with jitter applied
   */
  static calculateDelay(attempt: number, baseDelay: number): number {
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitterFactor = randomInt(0, 1_000_000) / 1_000_000;
    const jitter = jitterFactor * this.JITTER_PERCENTAGE * exponentialDelay;
    return Math.min(exponentialDelay + jitter, this.MAX_RETRY_DELAY_MS);
  }
}
