import { describe, expect, it } from 'vitest';

import {
  createEpisodeImagePool,
  deriveSearchSubjects,
  fallbackBasis,
  type PoolEntry,
  type PoolSubjectScene,
} from './episode-image-pool.js';

const scene = (entity: string): PoolSubjectScene => ({
  sceneId: 'scene-10',
  imageSearchIntent: [entity],
  imageSearchEntities: [entity],
});
const donor = (entity: string, altText = ''): PoolEntry => ({
  candidate: {
    imageUrl: 'https://images.test/image.jpg',
    sourceUrl: 'https://publisher.test/',
    origin: 'brave',
    altText,
  },
  canonicalUrl: 'https://images.test/image.jpg',
  queryKeys: [entity.toLowerCase()],
  providerRank: 0,
  requestSubjectKey: entity.toLowerCase(),
  requestQuery: entity,
  attempted: false,
});

describe('identity-compatible fallback', () => {
  it('rejects Shor for Bitcoin and BIP-32 scenes', () => {
    const pool = createEpisodeImagePool(
      deriveSearchSubjects([scene('Shor'), scene('Bitcoin')]),
    );
    expect(fallbackBasis(pool, donor('Shor'), scene('Bitcoin'))).toBeNull();
  });
  it('allows shared entities and candidate-named entities', () => {
    const pool = createEpisodeImagePool(
      deriveSearchSubjects([scene('Bitcoin')]),
    );
    expect(fallbackBasis(pool, donor('Bitcoin'), scene('Bitcoin'))).toBe(
      'shared-entity',
    );
    expect(
      fallbackBasis(pool, donor('Unknown', 'Bitcoin wallet'), scene('Bitcoin')),
    ).toBe('candidate-names-entity');
  });
  it('uses a primary entity intersection, not a composite subject key comparison', () => {
    const pool = createEpisodeImagePool(
      deriveSearchSubjects([
        { ...scene('OpenAI'), imageSearchEntities: ['OpenAI', 'Dots'] },
      ]),
      { primaryEntities: ['OpenAI'] },
    );
    expect(fallbackBasis(pool, donor('OpenAI'), scene('Finloop'))).toBe(
      'primary-subject',
    );
  });
  it('requires at least two cue terms in candidate metadata', () => {
    const pool = createEpisodeImagePool([]);
    const target = { ...scene('NVIDIA'), visualCue: 'stock chart plunge' };
    expect(fallbackBasis(pool, donor('Unknown', 'chart plunge'), target)).toBe(
      'visual-cue',
    );
    expect(fallbackBasis(pool, donor('Unknown', 'chart'), target)).toBeNull();
    expect(
      fallbackBasis(pool, donor('Unknown'), {
        ...target,
        imageSearchEntities: [],
        visualCue: undefined,
      }),
    ).toBeNull();
  });
});
