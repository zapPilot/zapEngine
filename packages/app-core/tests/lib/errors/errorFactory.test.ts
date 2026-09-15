import { describe, expect, it } from 'vitest';

import { resolveErrorMessage } from '@core/lib/errors/errorFactory';

describe('resolveErrorMessage', () => {
  it('skips nullish and invalid string sources until a useful value appears', () => {
    expect(
      resolveErrorMessage(
        'fallback',
        undefined,
        null,
        '',
        '   ',
        '[object Object]',
        '  useful message  ',
      ),
    ).toBe('useful message');
  });

  it('normalizes numeric, boolean, and bigint primitives', () => {
    expect(resolveErrorMessage('fallback', 42)).toBe('42');
    expect(resolveErrorMessage('fallback', false)).toBe('false');
    expect(resolveErrorMessage('fallback', 123n)).toBe('123');
  });

  it('uses Error.message, then Error.cause when the message is empty', () => {
    expect(resolveErrorMessage('fallback', new Error('boom'))).toBe('boom');
    const caused = new Error('', { cause: { detail: 'root cause' } });
    expect(resolveErrorMessage('fallback', caused)).toBe('root cause');
  });

  it('falls back when an Error has no usable message or cause', () => {
    expect(resolveErrorMessage('fallback', new Error(''))).toBe('fallback');
    expect(
      resolveErrorMessage('fallback', new Error('', { cause: null })),
    ).toBe('fallback');
  });

  it('walks candidate object keys and skips undefined/invalid nested values', () => {
    expect(
      resolveErrorMessage('fallback', {
        message: undefined,
        error: '',
        error_description: '[object Object]',
        detail: { reason: 'nested reason' },
      }),
    ).toBe('nested reason');
    expect(resolveErrorMessage('fallback', { title: 'A title' })).toBe(
      'A title',
    );
    expect(resolveErrorMessage('fallback', { description: 'desc' })).toBe(
      'desc',
    );
    expect(resolveErrorMessage('fallback', { reason: 'reason' })).toBe(
      'reason',
    );
  });

  it('serializes plain objects with no message-like field', () => {
    expect(resolveErrorMessage('fallback', { code: 500, ok: false })).toBe(
      '{"code":500,"ok":false}',
    );
  });

  it('handles cyclic candidate objects without recursion or JSON crashes', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.message = cyclic;
    cyclic.self = cyclic;
    expect(resolveErrorMessage('fallback', cyclic)).toBe('fallback');
  });

  it('stringifies otherwise unsupported primitive values', () => {
    expect(resolveErrorMessage('fallback', Symbol.for('boom'))).toBe(
      'Symbol(boom)',
    );
  });

  it('returns the fallback when every source is unusable', () => {
    expect(resolveErrorMessage('fallback', undefined, null, '')).toBe(
      'fallback',
    );
  });
});
