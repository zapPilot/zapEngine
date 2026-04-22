import { describe, expect, it } from 'vitest';

import { extractErrorMessage } from '@/lib/errors';

describe('extractErrorMessage', () => {
  it('returns message from Error instance', () => {
    expect(extractErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('returns the string directly when error is a string', () => {
    expect(extractErrorMessage('string error', 'fallback')).toBe(
      'string error',
    );
  });

  it('returns message from object with message property', () => {
    expect(extractErrorMessage({ message: 'obj msg' }, 'fallback')).toBe(
      'obj msg',
    );
  });

  it('returns fallback for object without message property', () => {
    expect(extractErrorMessage({ code: 500 }, 'fallback')).toBe('fallback');
  });

  it('returns fallback for object with non-string message', () => {
    expect(extractErrorMessage({ message: 123 }, 'fallback')).toBe('fallback');
  });

  it('returns fallback for null', () => {
    expect(extractErrorMessage(null, 'fallback')).toBe('fallback');
  });

  it('returns fallback for undefined', () => {
    expect(extractErrorMessage(undefined, 'fallback')).toBe('fallback');
  });

  it('returns fallback for number', () => {
    expect(extractErrorMessage(42, 'fallback')).toBe('fallback');
  });

  it('returns fallback for boolean', () => {
    expect(extractErrorMessage(true, 'fallback')).toBe('fallback');
  });

  it('uses custom fallback message', () => {
    expect(extractErrorMessage(null, 'custom fallback')).toBe(
      'custom fallback',
    );
  });
});
