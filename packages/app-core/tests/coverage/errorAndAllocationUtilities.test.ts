import {
  getAllocationCategoryForToken,
  ALLOCATION_CATEGORIES,
} from '@core/lib/domain/allocationCategories';
import {
  APIError,
  NetworkError,
  parseErrorResponse,
  TimeoutError,
  toError,
} from '@core/lib/http/errors';
import { describe, expect, it } from 'vitest';

describe('HTTP error utilities', () => {
  it('constructs typed API/network/timeout errors with defaults and overrides', () => {
    const api = new APIError('bad request', 400, 'BAD', { field: 'wallet' });
    expect(api).toMatchObject({
      name: 'APIError',
      message: 'bad request',
      status: 400,
      code: 'BAD',
      details: { field: 'wallet' },
    });

    expect(new NetworkError()).toMatchObject({
      name: 'NetworkError',
      message: 'Network connection failed',
    });
    expect(new NetworkError('offline').message).toBe('offline');
    expect(new TimeoutError()).toMatchObject({
      name: 'TimeoutError',
      message: 'Request timed out',
    });
    expect(new TimeoutError('slow').message).toBe('slow');
  });

  it('prefers response message, then error, then HTTP status and preserves details', async () => {
    await expect(
      parseErrorResponse({
        status: 422,
        json: async () => ({
          message: 'invalid',
          error: 'fallback',
          code: 'INVALID',
          details: { field: 'amount' },
        }),
      } as Response),
    ).resolves.toEqual({
      message: 'invalid',
      code: 'INVALID',
      details: { field: 'amount' },
    });

    await expect(
      parseErrorResponse({
        status: 409,
        json: async () => ({ error: 'conflict', extra: true }),
      } as Response),
    ).resolves.toEqual({
      message: 'conflict',
      code: undefined,
      details: { error: 'conflict', extra: true },
    });

    await expect(
      parseErrorResponse({
        status: 503,
        json: async () => ({}),
      } as Response),
    ).resolves.toEqual({
      message: 'HTTP 503',
      code: undefined,
      details: {},
    });
  });

  it('falls back to status text when parsing the response body throws', async () => {
    await expect(
      parseErrorResponse({
        status: 502,
        json: async () => {
          throw new SyntaxError('invalid json');
        },
      } as unknown as Response),
    ).resolves.toEqual({ message: 'HTTP 502' });
  });

  it('normalizes Error, string, object, empty object, and primitive values', () => {
    const original = new Error('already error');
    expect(toError(original)).toBe(original);
    expect(toError('plain string').message).toBe('plain string');
    expect(toError({ message: 'object message' }).message).toBe(
      'object message',
    );
    expect(toError({}).message).toBe('Unknown error');
    expect(toError(null).message).toBe('Unknown error occurred');
    expect(toError(123).message).toBe('Unknown error occurred');
  });
});

describe('allocation categories', () => {
  it('classifies canonical assets case-insensitively and falls back to altcoins', () => {
    expect(getAllocationCategoryForToken('BTC')).toBe('btc');
    expect(getAllocationCategoryForToken('ETH')).toBe('eth');
    expect(getAllocationCategoryForToken('SPY')).toBe('spy');
    expect(getAllocationCategoryForToken('USDC')).toBe('stable');
    expect(getAllocationCategoryForToken('SOL')).toBe('alt');
  });

  it('exposes metadata for every allocation category', () => {
    expect(Object.keys(ALLOCATION_CATEGORIES).sort()).toEqual([
      'alt',
      'btc',
      'eth',
      'spy',
      'stable',
    ]);
    expect(ALLOCATION_CATEGORIES.btc.shortLabel).toBe('BTC');
    expect(ALLOCATION_CATEGORIES.stable.label).toBe('Stablecoins');
  });
});
