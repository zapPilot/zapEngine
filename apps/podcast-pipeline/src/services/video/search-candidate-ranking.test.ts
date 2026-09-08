import { describe, expect, it } from 'vitest';

import type { ImageCandidate } from '../../types.js';
import {
  decorativeRejection,
  partitionViableCandidates,
  searchCandidateScore,
} from './search-candidate-ranking.js';

function candidate(overrides: Partial<ImageCandidate> = {}): ImageCandidate {
  return {
    imageUrl: 'https://images.example.test/photo.jpg',
    sourceUrl: 'https://www.reuters.com/story',
    origin: 'brave',
    altText: 'A news photograph',
    width: 1600,
    height: 1200,
    ...overrides,
  };
}

/** The token score is the only part of the ranking that reads the query, so the
 * difference between two candidates that are otherwise identical is exactly the
 * token match under test. */
function tokenScoreDelta(matching: ImageCandidate, intent: string): number {
  return (
    searchCandidateScore(matching, intent, []) -
    searchCandidateScore(candidate({ altText: '' }), intent, [])
  );
}

describe('searchCandidateScore token matching', () => {
  it('does not score a query token that only appears inside a longer word', () => {
    // This is the Tether episode: the top-ranked image was
    // `7-Reasons-Why-Tethering-Your-Phone.jpg`, which took the full token score
    // for "tether" and carried a charging cable into a stablecoin story.
    const tethering = candidate({
      imageUrl: 'https://images.example.test/7-Reasons-Why-Tethering.jpg',
      altText: 'Tethering your phone to a laptop',
    });

    expect(tokenScoreDelta(tethering, 'Tether')).toBe(0);
  });

  it('still scores the token when the candidate names it on its own', () => {
    const tether = candidate({ altText: 'Tether treasury holdings' });

    expect(tokenScoreDelta(tether, 'Tether')).toBeGreaterThan(0);
  });
});

describe('decorativeRejection', () => {
  const logoCandidate = candidate({
    imageUrl: 'https://images.example.test/tether-logo.png',
    altText: 'Tether logo',
  });

  it('drops a logo result by default', () => {
    expect(decorativeRejection(logoCandidate)).toBe('decorative-asset');
  });

  it('keeps a logo result when the subject is one whose mark is the image', () => {
    expect(decorativeRejection(logoCandidate, { allowLogo: true })).toBeNull();
  });

  it('keeps every other decorative rule while logos are allowed', () => {
    const favicon = candidate({
      imageUrl: 'https://images.example.test/favicon.png',
    });

    expect(decorativeRejection(favicon, { allowLogo: true })).toBe(
      'decorative-asset',
    );
  });
});

describe('partitionViableCandidates', () => {
  it('names the rule that removed each candidate, not only how many it removed', () => {
    const kept = candidate();
    const decorative = candidate({
      imageUrl: 'https://images.example.test/brand-icon.png',
    });
    const stock = candidate({
      imageUrl: 'https://images.example.test/shutterstock/1.jpg',
    });

    const partitioned = partitionViableCandidates(
      [kept, decorative, stock],
      ['brave'],
    );

    expect(partitioned.candidates).toEqual([kept]);
    expect(partitioned.dropReasons.get(decorative.imageUrl)).toBe(
      'decorative-asset',
    );
    expect(partitioned.dropReasons.get(stock.imageUrl)).toBe('stock-preview');
    expect(partitioned.dropReasons.has(kept.imageUrl)).toBe(false);
  });

  it('records the validation code a candidate was refused under', () => {
    const first = candidate();
    const repeat = candidate({ altText: 'The same photo again' });

    const partitioned = partitionViableCandidates([first, repeat], ['brave']);

    expect(partitioned.candidates).toEqual([first]);
    expect(partitioned.drops.get('duplicate-image')).toBe(1);
    expect(partitioned.dropReasons.get(repeat.imageUrl)).toBe(
      'duplicate-image',
    );
  });
});
