import {
  AccountServiceError,
  ServiceError,
} from '@core/lib/errors/ServiceError';
import {
  createErrorMapper,
  createServiceError,
} from '@core/lib/http/serviceErrorFactory';
import { describe, expect, it, vi } from 'vitest';

describe('serviceErrorFactory', () => {
  it('maps primitive errors to the default 500 response', () => {
    const factory = vi.fn(
      (
        message: string,
        status: number,
        code?: string,
        details?: Record<string, unknown>,
      ) => new ServiceError(message, status, code, details),
    );
    const mapError = createErrorMapper(factory, {}, 'fallback');

    const mapped = mapError(null);
    expect(mapped).toMatchObject({ message: 'fallback', status: 500 });
    expect(factory).toHaveBeenCalledWith('fallback', 500, undefined, undefined);
  });

  it('prefers direct status and status-specific messages while preserving code/details', () => {
    const mapError = createErrorMapper(
      (message, status, code, details) =>
        new ServiceError(message, status, code, details),
      { 429: 'rate limited' },
      'fallback',
    );

    expect(
      mapError({
        status: 429,
        message: 'ignored',
        code: 'RATE_LIMIT',
        details: { retryAfter: 3 },
      }),
    ).toMatchObject({
      message: 'rate limited',
      status: 429,
      code: 'RATE_LIMIT',
      details: { retryAfter: 3 },
    });
  });

  it('reads nested response status/data and ignores malformed code/details', () => {
    const mapError = createErrorMapper(
      (message, status, code, details) =>
        new ServiceError(message, status, code, details),
      {},
      'fallback',
    );

    expect(
      mapError({
        response: { status: 503, data: { message: 'upstream unavailable' } },
        code: 503,
        details: 'not-an-object',
      }),
    ).toMatchObject({
      message: 'upstream unavailable',
      status: 503,
      code: undefined,
      details: undefined,
    });
  });

  it('creates typed service errors with and without a message enhancer', () => {
    const plain = createServiceError(
      { response: { status: 404, data: { message: 'missing' } } },
      AccountServiceError,
      'fallback',
    );
    expect(plain).toBeInstanceOf(AccountServiceError);
    expect(plain).toMatchObject({ message: 'missing', status: 404 });

    const enhanced = createServiceError(
      {
        status: 400,
        message: 'bad input',
        code: 'BAD',
        details: { field: 'x' },
      },
      AccountServiceError,
      'fallback',
      (status, message) => `${status}: ${message}`,
    );
    expect(enhanced).toMatchObject({
      message: '400: bad input',
      status: 400,
      code: 'BAD',
      details: { field: 'x' },
    });
  });

  it('falls back when response is not an object', () => {
    const mapError = createErrorMapper(
      (message, status) => new ServiceError(message, status),
      {},
      'fallback',
    );
    expect(mapError({ response: 'bad' })).toMatchObject({
      message: 'fallback',
      status: 500,
    });
  });
});
