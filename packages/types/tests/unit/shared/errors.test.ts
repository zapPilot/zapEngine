import { errorMessage, toError } from '../../../src/shared/errors.js';

describe('errorMessage', () => {
  it('returns the message of an Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('stringifies a non-Error thrown value', () => {
    expect(errorMessage('boom')).toBe('boom');
    expect(errorMessage(42)).toBe('42');
    expect(errorMessage(null)).toBe('null');
  });
});

describe('toError', () => {
  it('returns the same Error instance unchanged', () => {
    const error = new Error('boom');
    expect(toError(error)).toBe(error);
  });

  it('wraps a non-Error thrown value in a new Error', () => {
    const wrapped = toError('boom');
    expect(wrapped).toBeInstanceOf(Error);
    expect(wrapped.message).toBe('boom');
  });
});
