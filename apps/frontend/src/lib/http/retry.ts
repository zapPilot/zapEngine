/**
 * Retry Logic and Backoff
 * Handles retry decision-making and exponential backoff calculations
 */

import { APIError } from "./errors";

// Retry logic helper
function shouldRetry(error: unknown): boolean {
  // Don't retry client errors (4xx), retry on network errors, timeouts, and 5xx
  return !(
    error instanceof APIError &&
    error.status >= 400 &&
    error.status < 500
  );
}

// Delay helper for exponential backoff
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function calculateBackoffDelay(
  baseDelay: number,
  attempt: number
): number {
  return baseDelay * Math.pow(2, attempt);
}

export function shouldAttemptRetry(
  attempt: number,
  retries: number,
  error: unknown
): boolean {
  if (attempt >= retries) {
    return false;
  }

  return shouldRetry(error);
}
