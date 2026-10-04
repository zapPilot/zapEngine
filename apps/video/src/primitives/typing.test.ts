import { describe, expect, it } from 'vitest';

import { typedText, typingEnd } from './typing';

describe('typedText', () => {
  it('shows nothing before typing starts and one code point per step after', () => {
    expect(typedText('abc', 5, 10, 2)).toBe('');
    expect(typedText('abc', 10, 10, 2)).toBe('');
    expect(typedText('abc', 12, 10, 2)).toBe('a');
    expect(typedText('abc', 15, 10, 2)).toBe('ab');
  });

  it('stops at the full text', () => {
    expect(typedText('abc', 16, 10, 2)).toBe('abc');
    expect(typedText('abc', 900, 10, 2)).toBe('abc');
  });

  it('never splits a surrogate pair', () => {
    expect(typedText('\u{1F600}x', 1, 0, 1)).toBe('\u{1F600}');
  });
});

describe('typingEnd', () => {
  it('is the first frame typedText shows the whole text', () => {
    expect(typingEnd('abc', 10, 2)).toBe(16);
    expect(typedText('abc', typingEnd('abc', 10, 2) - 1, 10, 2)).toBe('ab');
    expect(typingEnd('\u{1F600}x', 0, 3)).toBe(6);
    expect(typingEnd('', 7, 3)).toBe(7);
  });
});
