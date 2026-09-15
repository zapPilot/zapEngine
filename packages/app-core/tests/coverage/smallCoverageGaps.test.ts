import { describe, expect, it } from 'vitest';

import {
  computeStrategyDirection,
  getActiveStrategy,
} from '@core/lib/domain/strategySelector';
import { getAnalyticsStaleTime } from '@core/lib/analytics/cacheConfig';
import { APIError, NetworkError, TimeoutError } from '@core/lib/http/errors';
import { handleHTTPError } from '@core/lib/http/httpErrorHandler';

describe('strategySelector', () => {
  it('computes bullish, bearish, unchanged, and no-history directions', () => {
    expect(computeStrategyDirection('g', 'n')).toBe('fromLeft');
    expect(computeStrategyDirection('f', 'g')).toBe('fromRight');
    expect(computeStrategyDirection('n', 'n')).toBe('default');
    expect(computeStrategyDirection('n', null)).toBe('default');
  });

  it('prefers explicit server direction but computes missing/default values', () => {
    expect(getActiveStrategy('fromLeft', 'f', 'g')).toBe('fromLeft');
    expect(getActiveStrategy('fromRight', 'g', 'f')).toBe('fromRight');
    expect(getActiveStrategy('default', 'g', 'n')).toBe('fromLeft');
    expect(getActiveStrategy(undefined, 'f', 'g')).toBe('fromRight');
  });
});

describe('analytics cache config', () => {
  it('disables cache for period changes and differentiates wallet/bundle views', () => {
    expect(getAnalyticsStaleTime(true, '0xwallet')).toBe(0);
    expect(getAnalyticsStaleTime(false, '0xwallet')).toBe(2 * 60 * 1000);
    expect(getAnalyticsStaleTime(false, null)).toBe(12 * 60 * 60 * 1000);
    expect(getAnalyticsStaleTime(false, undefined)).toBe(12 * 60 * 60 * 1000);
  });
});

describe('handleHTTPError', () => {
  it('maps known API codes and preserves unknown API messages', () => {
    expect(
      handleHTTPError(new APIError('missing', 404, 'USER_NOT_FOUND')),
    ).toBe('User not found. Please connect your wallet first.');
    expect(handleHTTPError(new APIError('bad', 400, 'INVALID_ADDRESS'))).toBe(
      'Invalid wallet address provided.',
    );
    expect(handleHTTPError(new APIError('slow', 429, 'RATE_LIMITED'))).toBe(
      'Too many requests. Please try again later.',
    );
    expect(
      handleHTTPError(new APIError('backend exploded', 500, 'UNKNOWN')),
    ).toBe('backend exploded');
  });

  it('maps network, timeout, and unknown failures', () => {
    expect(handleHTTPError(new NetworkError())).toContain(
      'Network connection failed',
    );
    expect(handleHTTPError(new TimeoutError())).toContain('Request timed out');
    expect(handleHTTPError(new Error('mystery'))).toContain('unexpected error');
    expect(handleHTTPError('mystery')).toContain('unexpected error');
  });
});
