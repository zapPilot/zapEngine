import { describe, expect, it } from 'vitest';

import { isTransientNetworkError } from './transient-network-error.js';

describe('isTransientNetworkError coverage', () => {
  it('matches a transient token in the details field', () => {
    const error = new Error('request failed', {
      cause: { message: 'ok', details: 'read ECONNRESET while fetching' },
    });
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it('stops at a self-referential cause without looping', () => {
    const error = new Error('loop') as Error & { cause: unknown };
    error.cause = error;
    expect(isTransientNetworkError(error)).toBe(false);
  });

  it('matches a transient token nested in supabaseError.details', () => {
    const error = Object.assign(new Error('wrapped'), {
      supabaseError: { message: 'ok', details: 'socket hang up' },
    });
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it('ignores a non-transient supabaseError branch and keeps walking cause', () => {
    const error = Object.assign(new Error('wrapped'), {
      supabaseError: { message: 'not transient', details: 'PGRST202' },
      cause: { code: 'EAI_AGAIN' },
    });
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it('returns false when the cause chain ends without a token', () => {
    const error = new Error('outer', {
      cause: new Error('inner', { cause: null }),
    });
    expect(isTransientNetworkError(error)).toBe(false);
  });
});
