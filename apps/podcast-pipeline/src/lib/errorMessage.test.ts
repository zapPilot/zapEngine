import { describe, expect, it } from 'vitest';

import { errorMessage } from './errorMessage.js';

describe('errorMessage', () => {
  it('returns the message from an Error', () => {
    expect(errorMessage(new Error('request failed'))).toBe('request failed');
  });

  it('stringifies non-Error values', () => {
    expect(errorMessage('request failed')).toBe('request failed');
    expect(errorMessage(null)).toBe('null');
  });
});
