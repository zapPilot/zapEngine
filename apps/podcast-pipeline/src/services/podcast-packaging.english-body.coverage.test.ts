import { describe, expect, it } from 'vitest';

import { getEnglishBodyScript } from './podcast-packaging.js';

describe('getEnglishBodyScript coverage', () => {
  it('keeps unpackaged English scripts unchanged', () => {
    expect(getEnglishBodyScript('Intro. Body. Outro.', false)).toBe(
      'Intro. Body. Outro.',
    );
  });

  it('keeps blank packaged English scripts unchanged', () => {
    expect(getEnglishBodyScript('   ', true)).toBe('   ');
  });

  it('keeps packaged scripts with fewer than three sentences unchanged', () => {
    expect(getEnglishBodyScript('Intro. Body.', true)).toBe('Intro. Body.');
  });

  it('extracts only the body sentences from packaged English scripts', () => {
    expect(
      getEnglishBodyScript(
        'Intro sentence. First body. Second body. Outro sentence.',
        true,
      ),
    ).toBe('First body. Second body.');
  });
});
