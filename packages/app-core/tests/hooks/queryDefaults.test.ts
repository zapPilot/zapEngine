import { APIError } from '@core/lib/http';
import {
  createLoggedQueryFn,
  createQueryConfig,
  logQueryError,
} from '@core/hooks/queries/queryDefaults';
import { logger } from '@core/utils/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@core/utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('queryDefaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs structured API and generic errors', () => {
    logQueryError('failed request', new APIError('bad request', 400));
    expect(logger.error).toHaveBeenCalledWith('failed request', {
      error: 'bad request',
      status: 400,
    });

    logQueryError('generic', 'boom');
    expect(logger.error).toHaveBeenCalledWith('generic', {
      error: 'boom',
      status: undefined,
    });
  });

  it('returns fetched values, fallback values, or rethrows after logging', async () => {
    const success = createLoggedQueryFn('success', async () => 42);
    await expect(success()).resolves.toBe(42);

    const fallback = createLoggedQueryFn(
      'fallback',
      async () => {
        throw new Error('offline');
      },
      7,
    );
    await expect(fallback()).resolves.toBe(7);

    const rethrow = createLoggedQueryFn('rethrow', async () => {
      throw new Error('fatal');
    });
    await expect(rethrow()).rejects.toThrow('fatal');
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it('uses ETL timings by default and volatile timings on request', () => {
    const etl = createQueryConfig();
    const volatile = createQueryConfig({ dataType: 'volatile' });

    expect(etl.staleTime).toBeGreaterThan(volatile.staleTime);
    expect(etl.gcTime).toBeGreaterThan(volatile.gcTime);
  });

  it('honors custom retry logic ahead of default rules', () => {
    const customRetry = vi.fn().mockReturnValue(true);
    const config = createQueryConfig({
      retryConfig: {
        maxRetries: 0,
        customRetry,
      },
    });

    expect(config.retry(999, new APIError('bad', 400))).toBe(true);
    expect(customRetry).toHaveBeenCalledWith(999, expect.any(APIError));
  });

  it('stops at max retries and skips client errors by default', () => {
    const config = createQueryConfig();

    expect(config.retry(2, new Error('server'))).toBe(false);
    expect(config.retry(0, new APIError('not found', 404))).toBe(false);
  });

  it('can retry client errors and filter messages', () => {
    const config = createQueryConfig({
      retryConfig: {
        maxRetries: 3,
        skipClientErrors: false,
        skipErrorMessages: ['USER_NOT_FOUND'],
      },
    });

    expect(config.retry(0, new APIError('not found', 404))).toBe(true);
    expect(config.retry(0, new Error('USER_NOT_FOUND: missing'))).toBe(false);
    expect(config.retry(0, new Error('temporary'))).toBe(true);
    expect(config.retry(0, 'temporary')).toBe(true);
  });

  it('caps exponential retry delays at 30 seconds', () => {
    const config = createQueryConfig();

    expect(config.retryDelay(0)).toBe(1_500);
    expect(config.retryDelay(1)).toBe(3_000);
    expect(config.retryDelay(10)).toBe(30_000);
  });
});
