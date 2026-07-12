import { describe, expect, it } from 'vitest';

import { cleanTextForTts } from './tts-text-cleansing.js';

describe('cleanTextForTts', () => {
  it('removes standalone hyphen separators and retains one paragraph break', () => {
    expect(
      cleanTextForTts('First paragraph.\n\n---\n\nSecond paragraph.'),
    ).toBe('First paragraph.\n\nSecond paragraph.');
    expect(cleanTextForTts('First.\n  ------\t\nSecond.')).toBe(
      'First.\n\nSecond.',
    );
  });

  it('removes separators at the start and end without leaving blank lines', () => {
    expect(cleanTextForTts('---\n\nOpening.')).toBe('Opening.');
    expect(cleanTextForTts('Closing.\n\n---')).toBe('Closing.');
  });

  it('preserves inline and non-separator hyphen usage', () => {
    const text = [
      'Keep inline --- punctuation.',
      '--',
      '- list item',
      '-12 degrees',
      'An em dash — stays.',
    ].join('\n');

    expect(cleanTextForTts(text)).toBe(text);
  });

  it('preserves empty and unchanged input exactly', () => {
    expect(cleanTextForTts('')).toBe('');
    expect(cleanTextForTts('First.\n\n\nSecond.')).toBe('First.\n\n\nSecond.');
  });
});
