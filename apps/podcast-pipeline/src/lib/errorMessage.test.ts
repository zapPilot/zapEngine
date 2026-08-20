import { describe, expect, it } from 'vitest';

import { errorMessage, toError } from './errorMessage.js';

describe('errorMessage', () => {
  it('returns the message from an Error', () => {
    expect(errorMessage(new Error('request failed'))).toBe('request failed');
  });

  it('stringifies non-Error values', () => {
    expect(errorMessage('request failed')).toBe('request failed');
    expect(errorMessage(null)).toBe('null');
  });
});

describe('toError', () => {
  it('passes an Error through untouched', () => {
    const error = new Error('request failed');
    expect(toError(error)).toBe(error);
  });

  it('wraps non-Error values in an Error', () => {
    const wrapped = toError('request failed');
    expect(wrapped).toBeInstanceOf(Error);
    expect(wrapped.message).toBe('request failed');
    expect(toError(null).message).toBe('null');
  });
});
