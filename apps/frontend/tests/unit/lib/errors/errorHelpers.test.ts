import { describe, expect, it } from 'vitest';

import {
  createIntentServiceError,
  extractErrorCode,
  extractErrorMessage,
  extractStatusCode,
  isClientError,
  isRetryableError,
  isServerError,
} from '@/lib/errors/errorHelpers';
import {
  AccountServiceError,
  IntentServiceError,
} from '@/lib/errors/ServiceError';

describe('errorHelpers', () => {
  it('classifies client, server, and retryable errors from status', () => {
    expect(isClientError(new AccountServiceError('Client', 404))).toBe(true);
    expect(isServerError({ status: 503 })).toBe(true);
    expect(isRetryableError({ status: 408 })).toBe(true);
    expect(isRetryableError({ status: 400 })).toBe(false);
  });

  it('extracts status codes from service errors, plain objects, and response status', () => {
    expect(extractStatusCode(new AccountServiceError('Teapot', 418))).toBe(418);
    expect(extractStatusCode({ status: 401 })).toBe(401);
    expect(extractStatusCode({ response: { status: 502 } })).toBe(502);
    expect(extractStatusCode({})).toBe(500);
  });

  it('extracts error codes from service errors and plain objects', () => {
    expect(
      extractErrorCode(new AccountServiceError('Bad', 400, 'E_ACCOUNT')),
    ).toBe('E_ACCOUNT');
    expect(extractErrorCode({ code: 'E_GENERIC' })).toBe('E_GENERIC');
    expect(extractErrorCode({})).toBeUndefined();
  });

  it('enhances intent service errors with friendly messaging', () => {
    const intentError = createIntentServiceError({
      status: 400,
      message: 'Slippage too high',
    });
    expect(intentError).toBeInstanceOf(IntentServiceError);
    expect(intentError.status).toBe(400);
    expect(intentError.message).toBe(
      'Invalid slippage tolerance. Must be between 0.1% and 50%.',
    );
  });

  describe('createIntentServiceError - resolveIntentMessage coverage', () => {
    it('resolves 400 status with slippage keyword to friendly message', () => {
      const error = createIntentServiceError({
        status: 400,
        message: 'Invalid SLIPPAGE value',
      });
      expect(error.message).toBe(
        'Invalid slippage tolerance. Must be between 0.1% and 50%.',
      );
    });

    it('resolves 400 status with amount keyword to friendly message', () => {
      const error = createIntentServiceError({
        status: 400,
        message: 'Invalid AMOUNT provided',
      });
      expect(error.message).toBe(
        'Invalid transaction amount. Please check your balance.',
      );
    });

    it('returns default 400 message for status without known keywords', () => {
      const error = createIntentServiceError({
        status: 400,
        message: 'Some other validation error',
      });
      // getIntentErrorMessage applies service-specific default for 400
      expect(error.message).toBe('Invalid transaction parameters.');
    });

    it('resolves 429 status to rate limit message', () => {
      const error = createIntentServiceError({
        status: 429,
        message: 'Rate limit exceeded',
      });
      expect(error.message).toBe(
        'Too many transactions in progress. Please wait before submitting another.',
      );
    });

    it('resolves 503 status to overload message', () => {
      const error = createIntentServiceError({
        status: 503,
        message: 'Service unavailable',
      });
      expect(error.message).toBe(
        'Intent engine is temporarily overloaded. Please try again in a moment.',
      );
    });

    it('returns HTTP status message for non-special status codes', () => {
      const error = createIntentServiceError({
        status: 500,
        message: 'Internal server error',
      });
      // getIntentErrorMessage applies generic HTTP status message for 500
      expect(error.message).toBe(
        'Internal server error. Please try again later.',
      );
    });

    it('preserves error details and code when provided', () => {
      const error = createIntentServiceError({
        status: 400,
        code: 'E_SLIPPAGE',
        message: 'slippage error',
        details: { max: 50, provided: 100 },
      });
      expect(error.status).toBe(400);
      expect(error.code).toBe('E_SLIPPAGE');
      expect(error.details).toEqual({ max: 50, provided: 100 });
    });
  });

  describe('extractErrorMessage', () => {
    it('returns the message from an Error instance', () => {
      const error = new Error('something exploded');
      expect(extractErrorMessage(error, 'fallback')).toBe('something exploded');
    });

    it('returns a string error directly', () => {
      expect(extractErrorMessage('raw string error', 'fallback')).toBe(
        'raw string error',
      );
    });

    it('returns .message from a plain object', () => {
      expect(extractErrorMessage({ message: 'from object' }, 'fallback')).toBe(
        'from object',
      );
    });

    it('returns the fallback when error has no message', () => {
      expect(extractErrorMessage({}, 'fallback')).toBe('fallback');
    });

    it('returns the fallback for null', () => {
      expect(extractErrorMessage(null, 'fallback')).toBe('fallback');
    });

    it('returns the fallback for undefined', () => {
      expect(extractErrorMessage(undefined, 'fallback')).toBe('fallback');
    });

    it('returns the fallback when .message is not a string', () => {
      expect(extractErrorMessage({ message: 42 }, 'fallback')).toBe('fallback');
    });
  });
});
