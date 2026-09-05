import { describe, expect, it } from 'vitest';

import { throwSupabaseError } from '../services/supabase-client.js';
import { isTransientNetworkError } from './transient-network-error.js';

function buildPostgrestNetworkError(): unknown {
  try {
    throwSupabaseError({
      message: 'TypeError: fetch failed',
      details:
        'TypeError: fetch failed\n\nCaused by: Error: read ETIMEDOUT (ETIMEDOUT)\n    at ...',
      hint: '',
      code: '',
    });
  } catch (error) {
    return error;
  }
  return null;
}

describe('isTransientNetworkError', () => {
  it('matches the postgrest-wrapped ETIMEDOUT shape from throwSupabaseError', () => {
    const error = buildPostgrestNetworkError();
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it('matches a nested cause.code ECONNRESET', () => {
    const error = new Error('outer', { cause: { code: 'ECONNRESET' } });
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it('matches a raw undici fetch failed with UND_ERR_CONNECT_TIMEOUT', () => {
    const error = new TypeError('fetch failed', {
      cause: { code: 'UND_ERR_CONNECT_TIMEOUT' },
    } as never);
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it('matches fetch failed in details string', () => {
    const error = new Error('TypeError: fetch failed', {
      cause: { message: 'TypeError: fetch failed', details: 'fetch failed' },
    });
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it('matches socket hang up', () => {
    const error = new Error('socket hang up');
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it('matches code in supabaseError branch', () => {
    const error = Object.assign(new Error('wrapped'), {
      supabaseError: { code: 'ETIMEDOUT', message: 'timeout', details: '' },
    });
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it('does not match PGRST202', () => {
    let err: unknown;
    try {
      throwSupabaseError({
        message: 'Could not find the function',
        details: '',
        hint: '',
        code: 'PGRST202',
      });
    } catch (e) {
      err = e;
    }
    expect(isTransientNetworkError(err)).toBe(false);
  });

  it('does not match postgres 23505', () => {
    let err: unknown;
    try {
      throwSupabaseError({
        message: 'duplicate key value violates unique constraint',
        details: '',
        hint: '',
        code: '23505',
      });
    } catch (e) {
      err = e;
    }
    expect(isTransientNetworkError(err)).toBe(false);
  });

  it('does not match a generic reconcile lookup error', () => {
    expect(isTransientNetworkError(new Error('reconcile lookup down'))).toBe(
      false,
    );
  });

  it('does not match non-Error values', () => {
    expect(isTransientNetworkError(null)).toBe(false);
    expect(isTransientNetworkError(undefined)).toBe(false);
    expect(isTransientNetworkError('ETIMEDOUT')).toBe(false);
    expect(isTransientNetworkError(42)).toBe(false);
  });

  it('does not match statement timeout', () => {
    const error = new Error('statement timeout', {
      cause: {
        code: '57014',
        message: 'canceling statement due to statement timeout',
      },
    });
    expect(isTransientNetworkError(error)).toBe(false);
  });
});
