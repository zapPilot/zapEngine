import { describe, expect, it } from 'vitest';

import {
  cleanSubjectNameList,
  containsExactLetterToken,
  isSingleLetterName,
  isUsableHint,
  isUsableVisualSubjectName,
  tidyName,
} from './subject-names.js';

describe('tidyName', () => {
  it('folds compatibility forms and collapses whitespace before any policy check', () => {
    expect(tidyName('  Ｘ  ')).toBe('X');
    expect(tidyName('𝕏')).toBe('X');
    expect(tidyName(' X　Corp ')).toBe('X Corp');
  });
});

describe('one-letter name policy', () => {
  it.each(['X', 'Q', 'x', 'Ｘ', '𝕏'])(
    'accepts the single ASCII letter %s',
    (value) => {
      expect(isSingleLetterName(value)).toBe(true);
      expect(isUsableVisualSubjectName(value)).toBe(true);
    },
  );

  it.each(['中', '平', '7', '-', '!', '', ' '])(
    'rejects the one-character non-letter %j',
    (value) => {
      expect(isSingleLetterName(value)).toBe(false);
      expect(isUsableVisualSubjectName(value)).toBe(false);
    },
  );

  it('accepts two-character names with a letter or digit and rejects symbol-only names', () => {
    expect(isUsableVisualSubjectName('AI')).toBe(true);
    expect(isUsableVisualSubjectName('輝達')).toBe(true);
    expect(isUsableVisualSubjectName('--')).toBe(false);
    expect(isUsableVisualSubjectName('!!')).toBe(false);
  });

  it('bounds names at 80 characters', () => {
    expect(isUsableVisualSubjectName('a'.repeat(80))).toBe(true);
    expect(isUsableVisualSubjectName('a'.repeat(81))).toBe(false);
  });

  it('keeps identity hints at two characters or more', () => {
    expect(isUsableHint('ab')).toBe(true);
    expect(isUsableHint('a')).toBe(false);
    expect(isUsableHint('--')).toBe(false);
    expect(isUsableHint('a'.repeat(81))).toBe(false);
  });
});

describe('containsExactLetterToken', () => {
  it.each([
    ['X平台', true],
    ['X.com', true],
    ['Ｘ平台', true],
    ['𝕏 launch', true],
    ['X', true],
    ['10X', false],
    ['X86', false],
    ['next', false],
    ['tax', false],
    ['x402', false],
    ['x.com', false],
    ['x', false],
  ])('matches "X" in %j as %s', (text, expected) => {
    expect(containsExactLetterToken(text, 'X')).toBe(expected);
  });
});

describe('cleanSubjectNameList', () => {
  const usable = isUsableVisualSubjectName;

  it('drops invalid entries and records them without throwing away the rest', () => {
    const cleaned = cleanSubjectNameList(
      [42, '   ', '中', 'a'.repeat(81), 'Base'],
      { usable },
    );
    expect(cleaned.names).toEqual(['Base']);
    expect(cleaned.repairs).toEqual([
      { kind: 'dropped-invalid', value: '' },
      { kind: 'dropped-invalid', value: '' },
      { kind: 'dropped-invalid', value: '中' },
      { kind: 'dropped-invalid', value: 'a'.repeat(80) },
    ]);
  });

  it('drops repeats case-insensitively and anything equal to an excluded name', () => {
    const cleaned = cleanSubjectNameList(
      ['Coinbase', 'Base', 'base', 'Base', 'Ｘ'],
      { usable, exclude: ['Coinbase'] },
    );
    expect(cleaned.names).toEqual(['Base', 'X']);
    expect(cleaned.repairs).toEqual([
      { kind: 'dropped-duplicate', value: 'Coinbase' },
      { kind: 'dropped-duplicate', value: 'base' },
      { kind: 'dropped-duplicate', value: 'Base' },
    ]);
  });

  it('keeps the original order of surviving names', () => {
    const cleaned = cleanSubjectNameList(['Zeta', 'Alpha', 'Mid'], { usable });
    expect(cleaned.names).toEqual(['Zeta', 'Alpha', 'Mid']);
    expect(cleaned.repairs).toEqual([]);
  });
});

describe('containsExactLetterToken guard', () => {
  it('finds nothing when asked for a character that is not a single ASCII letter', () => {
    expect(containsExactLetterToken('a 7 b', '7')).toBe(false);
  });
});
