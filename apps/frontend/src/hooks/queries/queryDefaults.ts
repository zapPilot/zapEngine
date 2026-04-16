/**
 * React Query Configuration Defaults
 *
 * Provides reusable query configuration patterns for consistent
 * retry logic, timing, and error handling across all query hooks.
 *
 * Consolidates duplicated retry/timing configuration from 6+ query hooks.
 *
 * @example
 * ```typescript
 * // Standard usage (defaults to 'etl' timing)
 * const query = useQuery({
 *   ...createQueryConfig(),
 *   queryKey: ['tokens', address],
 *   queryFn: () => fetchTokens(address),
 * });
 *
 * // With custom retry logic
 * const query = useQuery({
 *   ...createQueryConfig({
 *     retryConfig: {
 *       skipErrorMessages: ['USER_NOT_FOUND'],
 *     },
 *   }),
 *   queryKey: ['portfolio', userId],
 *   queryFn: () => fetchPortfolio(userId),
 * });
 * ```
 *
 * @module hooks/queries/queryDefaults
 */

import { CACHE_WINDOW } from "@/config/cacheWindow";
import { isClientError } from "@/lib/errors/errorHelpers";
import { APIError } from "@/lib/http";
import { logger } from "@/utils";

/**
 * Data freshness profiles for different query types
 *
 * Updated to keep React Query aligned with server-provided Cache-Control headers.
 * ETL refresh happens daily, but HTTP cache max-age is held to 1 hour to
 * avoid 24-hour stale windows directly after an ETL completes.
 */
const HOURLY_ETL_TIMINGS = {
  staleTime: CACHE_WINDOW.staleTimeMs,
  gcTime: CACHE_WINDOW.gcTimeMs,
} as const;

const VOLATILE_TIMINGS = {
  staleTime: 5 * 60 * 1000,
  gcTime: 15 * 60 * 1000,
} as const;

const QUERY_TIMINGS = {
  /** Default timing that mirrors Cache-Control max-age/stale-while-revalidate */
  etl: HOURLY_ETL_TIMINGS,
  /** Short-lived override for explicitly real-time data */
  volatile: VOLATILE_TIMINGS,
} as const;

/**
 * Retry configuration options
 */
interface RetryConfig {
  /** Maximum number of retry attempts (default: 2) */
  maxRetries?: number;
  /** Skip retrying client errors (4xx status codes) (default: true) */
  skipClientErrors?: boolean;
  /** Skip retrying errors with specific message substrings */
  skipErrorMessages?: string[];
  /** Custom retry logic - overrides all default behavior */
  customRetry?: (failureCount: number, error: unknown) => boolean;
}

/**
 * Query configuration options
 */
interface QueryConfigOptions {
  /** Data type determines stale/cache times */
  dataType?: keyof typeof QUERY_TIMINGS;
  /** Retry behavior configuration */
  retryConfig?: RetryConfig;
}

interface QueryConfigResult {
  staleTime: number;
  gcTime: number;
  retry: (failureCount: number, error: unknown) => boolean;
  retryDelay: (attemptIndex: number) => number;
}

/**
 * Log a query error with structured context
 *
 * Encapsulates the shared error-logging pattern used across query hooks,
 * extracting `APIError` status when available.
 *
 * @param context - Human-readable description of what failed
 * @param error - The caught error
 *
 * @example
 * ```typescript
 * catch (error) {
 *   logQueryError("Failed to fetch sentiment", error);
 *   throw error;
 * }
 * ```
 */
export function logQueryError(context: string, error: unknown): void {
  logger.error(context, {
    error: error instanceof Error ? error.message : String(error),
    status: error instanceof APIError ? error.status : undefined,
  });
}

/**
 * Create standardized React Query configuration
 *
 * @param options - Configuration options
 * @returns Query configuration object with retry, retryDelay, staleTime, and gcTime
 */
export function createQueryConfig(
  options: QueryConfigOptions = {}
): QueryConfigResult {
  const { dataType = "etl", retryConfig } = options;

  const {
    maxRetries = 2,
    skipClientErrors = true,
    skipErrorMessages = [],
    customRetry,
  } = retryConfig || {};

  const timings = QUERY_TIMINGS[dataType];

  return {
    ...timings,
    retry: (failureCount: number, error: unknown) => {
      // Custom retry logic takes complete precedence
      if (customRetry) {
        return customRetry(failureCount, error);
      }

      // Max retries check
      if (failureCount >= maxRetries) {
        return false;
      }

      // Skip client errors (4xx) if configured
      if (skipClientErrors && isClientError(error)) {
        return false;
      }

      // Skip errors with specific messages
      if (error instanceof Error) {
        if (skipErrorMessages.some(msg => error.message.includes(msg))) {
          return false;
        }
      }

      return true;
    },
    retryDelay: (attemptIndex: number) =>
      Math.min(1500 * 2 ** attemptIndex, 30_000),
  };
}
