/**
 * Generic API result type for consistent error handling
 */
export type ApiResult<T, E = ApiError> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Standard API error structure
 */
export interface ApiError {
  code: ErrorCode;
  message: string;
  source: DataSource | 'system' | 'database';
  context?: ErrorContext;
  timestamp?: string;
}

/**
 * All possible error codes across services
 */
export type ErrorCode =
  | 'RATE_LIMIT_EXCEEDED'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'VALIDATION_ERROR'
  | 'API_ERROR'
  | 'DATABASE_ERROR'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';

/**
 * Error context for debugging
 */
export interface ErrorContext {
  jobId?: string;
  userId?: string;
  wallet?: string;
  source?: DataSource;
  endpoint?: string;
  [key: string]: unknown;
}

/**
 * Data sources for ETL pipeline
 */
export type DataSource = 'defillama' | 'debank' | 'hyperliquid' | 'feargreed' | 'token-price';

export const DATA_SOURCES: readonly DataSource[] = [
  'defillama',
  'debank',
  'hyperliquid',
  'feargreed',
  'token-price'
] as const;

/**
 * API response wrapper with timestamp
 */
export type ApiResponse<T = unknown> = ApiResult<T> & { timestamp: string };

/**
 * Nullable utility type
 */
export type Nullable<T> = T | null;
