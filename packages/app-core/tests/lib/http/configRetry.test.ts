import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  mode: 'development',
  values: {} as Record<string, string | undefined>,
}));

vi.mock('@core/lib/env/runtimeEnv', () => ({
  getRuntimeEnv: (key: string) => env.values[key],
  isRuntimeMode: (mode: string) => env.mode === mode,
}));

import { API_ENDPOINTS, HTTP_CONFIG } from '@core/lib/http/config';
import { APIError } from '@core/lib/http/errors';
import {
  calculateBackoffDelay,
  shouldAttemptRetry,
} from '@core/lib/http/retry';

describe('HTTP config and retry', () => {
  beforeEach(() => {
    env.mode = 'development';
    env.values = {};
  });

  it('reads endpoint env lazily and falls back to empty strings', () => {
    expect(API_ENDPOINTS.analyticsEngine).toBe('');
    expect(API_ENDPOINTS.accountApi).toBe('');

    env.values.VITE_ANALYTICS_ENGINE_URL = 'https://analytics.example';
    env.values.VITE_ACCOUNT_API_URL = 'https://account.example';
    expect(API_ENDPOINTS.analyticsEngine).toBe('https://analytics.example');
    expect(API_ENDPOINTS.accountApi).toBe('https://account.example');
  });

  it('uses shorter non-production and longer production timeouts', () => {
    expect(HTTP_CONFIG.timeout).toBe(15_000);
    env.mode = 'test';
    expect(HTTP_CONFIG.timeout).toBe(15_000);
    env.mode = 'production';
    expect(HTTP_CONFIG.timeout).toBe(30_000);
    expect(HTTP_CONFIG.retries).toBe(1);
    expect(HTTP_CONFIG.retryDelay).toBe(2_000);
  });

  it('calculates exponential retry delays', () => {
    expect(calculateBackoffDelay(500, 0)).toBe(500);
    expect(calculateBackoffDelay(500, 1)).toBe(1000);
    expect(calculateBackoffDelay(500, 3)).toBe(4000);
  });

  it('stops after the retry ceiling before inspecting error kind', () => {
    expect(shouldAttemptRetry(2, 2, new Error('network'))).toBe(false);
    expect(shouldAttemptRetry(3, 2, new APIError('server', 500))).toBe(false);
  });

  it('does not retry 4xx API errors', () => {
    expect(shouldAttemptRetry(0, 2, new APIError('bad request', 400))).toBe(
      false,
    );
    expect(shouldAttemptRetry(0, 2, new APIError('rate limited', 429))).toBe(
      false,
    );
    expect(
      shouldAttemptRetry(0, 2, new APIError('last client error', 499)),
    ).toBe(false);
  });

  it('retries 5xx API errors and non-API failures below the ceiling', () => {
    expect(shouldAttemptRetry(0, 2, new APIError('server', 500))).toBe(true);
    expect(shouldAttemptRetry(1, 2, new APIError('server', 503))).toBe(true);
    expect(shouldAttemptRetry(0, 2, new Error('network'))).toBe(true);
    expect(shouldAttemptRetry(0, 2, 'timeout')).toBe(true);
  });
});
