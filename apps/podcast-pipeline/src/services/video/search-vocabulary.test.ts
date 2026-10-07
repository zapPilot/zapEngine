import { describe, expect, it } from 'vitest';

import {
  cueTokenMatchCount,
  searchCueScore,
} from './search-candidate-ranking.js';
import {
  containsShapingTerm,
  normalizedSearchTokens,
} from './search-vocabulary.js';

describe('identity vocabulary', () => {
  it.each([
    'photo',
    'AI engineers monitoring',
    'editorial documentary',
    'office exterior',
    'real world',
  ])('detects shaping in %s', (text) =>
    expect(containsShapingTerm(text)).toBe(true),
  );
  it.each(['Office Depot', 'Signature Bank', 'Microsoft Teams'])(
    'exempts the complete name %s',
    (name) => expect(containsShapingTerm(name, [name])).toBe(false),
  );
  it('still rejects shaping outside an exempt name', () => {
    expect(
      containsShapingTerm('Office Depot office photo', ['Office Depot']),
    ).toBe(true);
    expect(containsShapingTerm('officer photograph')).toBe(true);
    expect(containsShapingTerm('officer photogenic')).toBe(false);
  });
  it('preserves ranking tokens and cue scores', () => {
    expect(
      normalizedSearchTokens('The NVIDIA NVIDIA office photo 2026'),
    ).toEqual(['nvidia', '2026']);
    const candidate = {
      imageUrl: 'https://test.test/image.jpg',
      sourceUrl: 'https://test.test/',
      origin: 'brave' as const,
      altText: 'chip launch keynote stage',
    };
    expect(cueTokenMatchCount(candidate, 'chip launch keynote stage')).toBe(4);
    expect(searchCueScore(candidate, 'chip launch keynote stage')).toBe(18);
    expect(searchCueScore(candidate, '')).toBe(0);
  });
});
