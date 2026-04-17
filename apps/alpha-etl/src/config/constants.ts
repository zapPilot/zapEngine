const MILLISECONDS_PER_MINUTE = 60_000;
const MILLISECONDS_PER_DAY = 86_400_000;

/** Rate Limiting Configuration */
export const RATE_LIMITS = {
  /** Default rate limit for API requests per minute */
  DEFILLAMA_RPM: 60,
  /** Delay between DeFiLlama API requests in milliseconds */
  DEFILLAMA_DELAY_MS: 1000,
  /** Delay between DeBank API requests in milliseconds */
  DEBANK_DELAY_MS: 1000,
  /** Hyperliquid API rate limit (requests per minute) */
  HYPERLIQUID_DEFAULT_RPM: 60,
  /** Fear & Greed Index API rate limit (requests per minute) */
  FEARGREED_RPM: 10,
  /** CoinMarketCap API rate limit (requests per minute) */
  COINMARKETCAP_RPM: 10,
  /** CoinMarketCap delay in milliseconds */
  COINMARKETCAP_DELAY_MS: 6000,
  /** CoinGecko API rate limit (requests per minute) */
  COINGECKO_RPM: 30,
  /** CoinGecko delay in milliseconds */
  COINGECKO_DELAY_MS: 2000,
  /** Milliseconds per minute for rate limit calculations */
  MS_PER_MINUTE: MILLISECONDS_PER_MINUTE,
} as const;

/** Timeout Configuration */
export const TIMEOUTS = {
  /** Default timeout for API requests in milliseconds */
  API_REQUEST_MS: 30000,
  /** Timeout for health check requests in milliseconds */
  HEALTH_CHECK_MS: 10000,
  /** Delay between job processing iterations in milliseconds */
  JOB_PROCESSING_DELAY_MS: 1000,
  /** Interval between health check monitor runs in milliseconds */
  HEALTH_CHECK_INTERVAL_MS: 15000,
} as const;

/** APR Validation Rules */
export const APR_VALIDATION = {
  /** Minimum valid APR value (0%) */
  MIN_APR: 0,
  /** Maximum valid APR value (1000%) - rejects obviously invalid data */
  MAX_APR: 10,
  /** Days per year for APR calculations */
  DAYS_PER_YEAR: 365,
} as const;

/** Time Calculation Constants */
export const TIME_CONSTANTS = {
  /** Milliseconds per second */
  MS_PER_SECOND: 1000,
  /** Seconds per day */
  SECONDS_PER_DAY: 86400,
  /** Milliseconds per day (24 * 60 * 60 * 1000) */
  MS_PER_DAY: MILLISECONDS_PER_DAY,
} as const;

/** Data Validation Limits */
export const DATA_LIMITS = {
  /** Minimum sentiment value (Fear & Greed Index) */
  SENTIMENT_MIN: 0,
  /** Maximum sentiment value (Fear & Greed Index) */
  SENTIMENT_MAX: 100,
  /** Maximum age for cached data in hours */
  MAX_DATA_AGE_HOURS: 24,
} as const;

/**
 * Materialized View Configuration
 */
export interface MVConfig {
  name: string;
}

/** Materialized View Refresh Configuration */
export const MV_REFRESH_CONFIG = {
  /**
   * List of materialized views to refresh after ETL completion
   * Order matters - MVs are refreshed sequentially and abort on failure
   * since later MVs may depend on earlier ones
   */
  MATERIALIZED_VIEWS: [
    { name: "alpha_raw.daily_wallet_token_snapshots" },
    { name: "public.daily_portfolio_snapshots" },
    { name: "public.portfolio_category_trend_mv" },
  ] as const satisfies readonly MVConfig[],
  /** Number of retry attempts for failed MV refresh operations */
  MAX_RETRIES: 2,
  /** Base delay for exponential backoff retry (milliseconds) */
  RETRY_BASE_DELAY_MS: 1000,
} as const;
