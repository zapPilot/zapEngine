import { describe, expect, it } from 'vitest';

import {
  describeThreadsApiError,
  nonemptyString,
  parseThreadsApiJson,
} from './threads-api.js';

describe('Threads API helpers', () => {
  it('parses JSON and fails closed for blank or malformed payloads', () => {
    expect(parseThreadsApiJson('{"id":"thread-1"}')).toEqual({
      id: 'thread-1',
    });
    expect(parseThreadsApiJson('   ')).toBeNull();
    expect(parseThreadsApiJson('{broken')).toBeNull();
  });

  it('prefers the structured Threads error message', () => {
    expect(
      describeThreadsApiError(
        400,
        { error: { message: '  Invalid access token  ' } },
        'fallback',
      ),
    ).toBe('Threads API 400: Invalid access token');
  });

  it('uses trimmed raw fallback text or the generic failure message', () => {
    expect(describeThreadsApiError(503, null, '  upstream unavailable  ')).toBe(
      'Threads API 503: upstream unavailable',
    );
    expect(describeThreadsApiError(500, { error: {} }, '   ')).toBe(
      'Threads API 500: request failed',
    );
  });

  it('distinguishes nonempty strings from invalid values', () => {
    expect(nonemptyString(' value ')).toBe(true);
    expect(nonemptyString('   ')).toBe(false);
    expect(nonemptyString(123)).toBe(false);
  });
});
