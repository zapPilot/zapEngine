import { describe, expect, it } from 'vitest';

import {
  canonicalSentenceRangeText,
  formatSentencesForPrompt,
  splitCanonicalSentences,
} from './sentences.js';

describe('splitCanonicalSentences', () => {
  it('keeps decimal numbers, dotted identifiers, abbreviations, and initials inside sentences', () => {
    const script =
      'Rate was 3.14 today. U.S markets moved. alpha.beta stays joined. Dr. Smith spoke. A.B. Carter agreed.';
    const sentences = splitCanonicalSentences(script);

    expect(sentences.map((sentence) => sentence.text)).toEqual([
      'Rate was 3.14 today.',
      'U.S markets moved.',
      'alpha.beta stays joined.',
      'Dr. Smith spoke.',
      'A.B. Carter agreed.',
    ]);
  });

  it('treats a lowercase-to-uppercase period as a terminator and handles repeated periods', () => {
    const sentences = splitCanonicalSentences('end.Next... Final.');
    expect(sentences.map((sentence) => sentence.text)).toEqual([
      'end.',
      'Next...',
      'Final.',
    ]);
  });

  it('handles periods at string boundaries without indexing outside the script', () => {
    expect(splitCanonicalSentences('. Start.')).toHaveLength(2);
    expect(splitCanonicalSentences('End.').at(-1)?.text).toBe('End.');
  });

  it('recognizes hard terminators and includes trailing quote/bracket closers', () => {
    const script = '第一句！」「 第二句？） Third;] Fourth；』';
    expect(splitCanonicalSentences(script).map((sentence) => sentence.text)).toEqual([
      '第一句！」',
      '「 第二句？）',
      'Third;]',
      'Fourth；』',
    ]);
  });

  it('splits LF, CR, and CRLF while trimming blank whitespace-only ranges', () => {
    const script = '  First line  \r\n\rSecond line\n   \nThird line';
    const sentences = splitCanonicalSentences(script);
    expect(sentences.map((sentence) => sentence.text)).toEqual([
      'First line',
      'Second line',
      'Third line',
    ]);
    expect(sentences[0]).toMatchObject({ id: 's0001', index: 0 });
    expect(sentences[2]).toMatchObject({ id: 's0003', index: 2 });
  });

  it('returns an empty list for empty and whitespace-only scripts', () => {
    expect(splitCanonicalSentences('')).toEqual([]);
    expect(splitCanonicalSentences('   \n\r\n   ')).toEqual([]);
  });
});

describe('canonical sentence helpers', () => {
  const script = 'First. Second. Third.';
  const sentences = splitCanonicalSentences(script);

  it('returns exact text for a valid inclusive sentence range', () => {
    expect(canonicalSentenceRangeText(script, sentences, 's0001', 's0002')).toBe(
      'First. Second.',
    );
  });

  it('returns null for unknown or reversed ranges', () => {
    expect(canonicalSentenceRangeText(script, sentences, 's9999', 's0002')).toBeNull();
    expect(canonicalSentenceRangeText(script, sentences, 's0001', 's9999')).toBeNull();
    expect(canonicalSentenceRangeText(script, sentences, 's0003', 's0001')).toBeNull();
  });

  it('formats canonical sentence ids and text for prompts', () => {
    expect(formatSentencesForPrompt(sentences)).toBe(
      's0001\tFirst.\ns0002\tSecond.\ns0003\tThird.',
    );
    expect(formatSentencesForPrompt([])).toBe('');
  });
});
