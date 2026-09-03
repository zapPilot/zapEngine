import { describe, expect, it } from 'vitest';

import {
  containsEntityPhrase,
  isEnglishOnly,
  NON_LATIN_SCRIPT_PATTERN,
  normalizedEntityText,
} from './english-text.js';

describe('NON_LATIN_SCRIPT_PATTERN', () => {
  it.each([
    ['Han', '比特幣'],
    ['Hiragana', 'ひらがな'],
    ['Katakana', 'カタカナ'],
    ['Hangul', '한글'],
    ['mixed into Latin', 'Bank of 日本'],
  ])('detects %s script', (_label, value) => {
    expect(NON_LATIN_SCRIPT_PATTERN.test(value)).toBe(true);
  });

  it.each([
    ['plain ASCII', 'Federal Reserve'],
    ['Latin with diacritics', 'Crédit Agricole São Paulo'],
    ['digits and punctuation', '25% — $1,000 (approx.)'],
    ['empty string', ''],
  ])('ignores %s', (_label, value) => {
    expect(NON_LATIN_SCRIPT_PATTERN.test(value)).toBe(false);
  });
});

describe('normalizedEntityText', () => {
  it('applies NFKC, lowercases, and collapses punctuation runs to single spaces', () => {
    // Fullwidth letters and the ligature fold under NFKC; every separator run
    // becomes one space and edges are trimmed.
    expect(normalizedEntityText('  Ｂank-of_Japan!!  ')).toBe('bank of japan');
    expect(normalizedEntityText('ﬁnance')).toBe('finance');
    expect(normalizedEntityText('Coldcard_Mk4 / review')).toBe(
      'coldcard mk4 review',
    );
  });

  it('keeps letters and digits from any script', () => {
    expect(normalizedEntityText('日本銀行 2026')).toBe('日本銀行 2026');
  });

  it('returns an empty string for punctuation-only input', () => {
    expect(normalizedEntityText('--- !!! ***')).toBe('');
  });
});

describe('containsEntityPhrase', () => {
  it('matches the phrase on word boundaries regardless of separators or case', () => {
    expect(
      containsEntityPhrase('The BANK-OF-JAPAN raised rates', 'bank of japan'),
    ).toBe(true);
    expect(containsEntityPhrase('coldcard-mk4-review', 'Coldcard Mk4')).toBe(
      true,
    );
  });

  it('matches at the very start and the very end of the corpus', () => {
    expect(containsEntityPhrase('Coinbase lists a token', 'Coinbase')).toBe(
      true,
    );
    expect(containsEntityPhrase('a token listed on Coinbase', 'Coinbase')).toBe(
      true,
    );
  });

  it('rejects partial-word matches', () => {
    expect(containsEntityPhrase('Coinbases are not Coinbase', 'Coinbase')).toBe(
      true,
    );
    expect(containsEntityPhrase('Coinbases listed', 'Coinbase')).toBe(false);
    expect(containsEntityPhrase('Bank of Japanese food', 'Bank of Japan')).toBe(
      false,
    );
  });

  it('rejects an entity that normalizes to nothing', () => {
    expect(containsEntityPhrase('anything at all', '!!!')).toBe(false);
    expect(containsEntityPhrase('anything at all', '')).toBe(false);
  });

  it('rejects a phrase whose words appear out of order', () => {
    expect(containsEntityPhrase('Japan Bank of', 'Bank of Japan')).toBe(false);
  });
});

describe('isEnglishOnly', () => {
  it('accepts Latin text with digits, punctuation, and diacritics', () => {
    expect(isEnglishOnly('Fed holds at 5.25% — markets shrug')).toBe(true);
    expect(isEnglishOnly('Zürich')).toBe(true);
    expect(isEnglishOnly('')).toBe(true);
  });

  it('rejects any CJK or Hangul character', () => {
    expect(isEnglishOnly('Fed 利率')).toBe(false);
    expect(isEnglishOnly('テスト')).toBe(false);
    expect(isEnglishOnly('테스트')).toBe(false);
  });
});
