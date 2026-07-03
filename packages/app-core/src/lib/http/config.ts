/**
 * HTTP Configuration
 * API endpoints and default HTTP settings
 */

import { getRuntimeEnv, isRuntimeMode } from '@core/lib/env/runtimeEnv';

// API endpoints configuration
// Lazy accessors: env is injected at app bootstrap (configureAppCoreEnv), so
// reads must happen after module load, not at it.
export const API_ENDPOINTS = {
  get analyticsEngine(): string {
    return getRuntimeEnv('VITE_ANALYTICS_ENGINE_URL') || '';
  },
  get accountApi(): string {
    return getRuntimeEnv('VITE_ACCOUNT_API_URL') || '';
  },
  debank: 'https://pro-openapi.debank.com/v1',
} as const;

// Default configuration
// Updated for analytics endpoints: longer timeout, fewer retries to reduce cancelled request spam
export const HTTP_CONFIG = {
  // Shorter in dev/test to avoid hanging requests; lazy for the same reason as above
  get timeout(): number {
    return isRuntimeMode('production') ? 30000 : 15000;
  },
  retries: 1, // Only retry once to avoid request storms (was 3)
  retryDelay: 2000, // 2s delay before retry (was 1s)
} as const;

// Internal types for HTTP utilities
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export type ResponseTransformer<T = unknown> = (data: unknown) => T;

// HTTP request configuration interface
export interface HttpRequestConfig {
  method?: HTTPMethod;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  signal?: AbortSignal;
  baseURL?: string;
}
