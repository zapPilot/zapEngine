import { describe, expect, it } from 'vitest';

import { cliArgs, requireVideoId, selectedLangs } from './args';

describe('cliArgs', () => {
  it('ignores the literal -- pnpm forwards', () => {
    const { values, positionals } = cliArgs(
      ['--', 'calculator-pitch', '--only', 'a,b'],
      {
        only: { type: 'string' },
      },
    );
    expect(positionals).toEqual(['calculator-pitch']);
    expect(values.only).toBe('a,b');
  });

  it('rejects unknown flags', () => {
    expect(() => cliArgs(['--nope'], {})).toThrow();
  });
});

describe('requireVideoId', () => {
  it('returns the one known id', () => {
    expect(requireVideoId(['a'], ['a', 'b'])).toBe('a');
  });

  it('explains what it expected', () => {
    expect(() => requireVideoId([], ['a'])).toThrow(
      'Expected exactly one video id: a. Got: (none)',
    );
    expect(() => requireVideoId(['a', 'b'], ['a', 'b'])).toThrow('Got: a b');
    expect(() => requireVideoId(['c'], ['a'])).toThrow('Got: c');
  });
});

describe('selectedLangs', () => {
  it('selects all versions or the requested available version', () => {
    expect(selectedLangs(['ja', 'en'])).toEqual(['ja', 'en']);
    expect(selectedLangs(['ja', 'en'], 'en')).toEqual(['en']);
    expect(() => selectedLangs(['en'], 'ja')).toThrow('Available: en');
  });
});
