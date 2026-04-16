/**
 * Job processing configuration constants
 * Consolidates magic numbers across job-related services
 */
export const JOB_CONFIG = {
  /**
   * Interval for processing job queue (5 seconds)
   */
  PROCESSING_INTERVAL_MS: 5000,

  /**
   * Maximum number of jobs to process concurrently
   */
  MAX_CONCURRENT_JOBS: 3,

  /**
   * Interval for cleaning up completed/failed jobs (1 hour)
   */
  CLEANUP_INTERVAL_MS: 60 * 60 * 1000,

  /**
   * Default base delay for retry attempts (1 second)
   */
  DEFAULT_RETRY_BASE_DELAY: 1000,

  /**
   * Default maximum retry attempts
   */
  DEFAULT_MAX_RETRIES: 3,

  /**
   * Maximum retries for fan-out child jobs (batch → single user)
   */
  FANOUT_MAX_RETRIES: 2,

  /**
   * Retry delay in seconds for fan-out child jobs
   */
  FANOUT_RETRY_DELAY_SECONDS: 30,
} as const;

/**
 * Analytics service configuration constants
 */
export const ANALYTICS_CONFIG = {
  /**
   * Request timeout for analytics API calls (10 seconds)
   */
  REQUEST_TIMEOUT_MS: 10000,

  /**
   * Request timeout for daily suggestion calls (20 seconds)
   */
  DAILY_SUGGESTION_REQUEST_TIMEOUT_MS: 20000,

  /**
   * Request timeout for health check calls (5 seconds)
   */
  HEALTH_CHECK_TIMEOUT_MS: 5000,

  /**
   * Default base analytics service port
   */
  DEFAULT_BASE_PORT: 8000,

  /**
   * Default trends analytics service port
   */
  DEFAULT_TRENDS_PORT: 8001,
} as const;
