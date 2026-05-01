import { z } from 'zod';

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

export const DATA_SOURCES = [
  'defillama',
  'debank',
  'hyperliquid',
  'feargreed',
  'macro-fear-greed',
  'token-price',
  'stock-price',
] as const;

/**
 * Data sources for ETL pipeline
 */
export type DataSource = (typeof DATA_SOURCES)[number];

export const DataSourceSchema = z.enum(DATA_SOURCES);

/**
 * API response wrapper with timestamp
 */
export type ApiResponse<T = unknown> = ApiResult<T> & { timestamp: string };

/**
 * Nullable utility type
 */
export type Nullable<T> = T | null;

export * from './marketDashboard.js';
