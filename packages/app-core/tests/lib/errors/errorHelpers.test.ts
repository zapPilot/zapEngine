import {
  AnalyticsServiceError,
  extractErrorMessage,
  isClientError,
  isNotFoundError,
} from '@core/lib/errors';
import { describe, expect, it } from 'vitest';

describe('extractErrorMessage', () => {
  it('reads the message off Error, string and message-bearing shapes', () => {
    expect(extractErrorMessage(new Error('boom'))).toBe('boom');
    expect(extractErrorMessage('boom')).toBe('boom');
    expect(extractErrorMessage({ message: 'boom' })).toBe('boom');
  });

  it('falls back when there is no usable message', () => {
    expect(extractErrorMessage({ code: 500 }, 'fallback')).toBe('fallback');
  });
});

describe('isClientError', () => {
  it('accepts a 4xx status from either a ServiceError or a plain object', () => {
    expect(isClientError(new AnalyticsServiceError('nope', 404))).toBe(true);
    expect(isClientError({ status: 429 })).toBe(true);
  });

  it('rejects server errors and statusless failures', () => {
    expect(isClientError({ status: 503 })).toBe(false);
    expect(isClientError(new Error('network down'))).toBe(false);
  });
});

describe('isNotFoundError', () => {
  it('recognises a 404 status', () => {
    expect(isNotFoundError(new AnalyticsServiceError('missing', 404))).toBe(
      true,
    );
    expect(isNotFoundError({ status: 404 })).toBe(true);
  });

  it('recognises the backend USER_NOT_FOUND message', () => {
    expect(isNotFoundError(new Error('USER_NOT_FOUND'))).toBe(true);
    expect(isNotFoundError('Analytics request failed: USER_NOT_FOUND')).toBe(
      true,
    );
  });

  // The retry rail in `useLandingPageData` also matches "404" by message, so a
  // status-less transport that only reports the code in text still counts.
  it('recognises a 404 reported only in the message', () => {
    expect(isNotFoundError(new Error('Request failed with status 404'))).toBe(
      true,
    );
  });

  it('does not classify a transport or server failure as not-found', () => {
    expect(isNotFoundError(new Error('Network request failed'))).toBe(false);
    expect(isNotFoundError(new AnalyticsServiceError('boom', 500))).toBe(false);
    expect(isNotFoundError({ status: 403 })).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
    expect(isNotFoundError(undefined)).toBe(false);
  });
});
