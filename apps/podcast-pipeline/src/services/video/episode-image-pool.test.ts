import { describe, expect, it, vi } from 'vitest';

import type { ImageCandidate } from '../../types.js';
import {
  createEpisodeImagePool,
  deriveSearchSubjects,
  rankFallbackEntries,
  searchSubject,
  subjectEntries,
} from './episode-image-pool.js';
import type { ImageSearchProvider } from './image-search-provider.js';

function braveResult(
  id: string,
  altText: string,
  sourceUrl?: string,
): ImageCandidate {
  return {
    imageUrl: `https://images.example.test/${id}.jpg`,
    sourceUrl: sourceUrl ?? `https://publisher.example.test/${id}`,
    origin: 'brave',
    width: 1_920,
    height: 1_080,
    altText,
  };
}

const tetherScene = {
  sceneId: 'scene-01',
  imageSearchIntent: ['Tether stablecoin issuer'],
  imageSearchEntities: ['Tether'],
  searchAnchor: 'direct' as const,
  subjectType: 'company',
};

const orsiScene = {
  sceneId: 'scene-02',
  imageSearchIntent: ['Yamandú Orsi Uruguay president'],
  imageSearchEntities: ['Yamandú Orsi'],
  searchAnchor: 'direct' as const,
  subjectType: 'person',
};

describe('episode image pool subject collision guard', () => {
  it('keeps generic results from the requested subject but rejects a result that explicitly names another episode subject', async () => {
    const subjects = deriveSearchSubjects([tetherScene, orsiScene]);
    const tether = subjects.find((subject) => subject.label === 'Tether');
    expect(tether).toBeDefined();

    const pool = createEpisodeImagePool(subjects);
    const provider: ImageSearchProvider = {
      origin: 'brave',
      maxResults: 100,
      search: vi.fn().mockResolvedValue([
        braveResult(
          'orsi',
          'Yamandú Orsi',
          'https://simple.wikipedia.org/wiki/Yamand%C3%BA_Orsi',
        ),
        braveResult('mining-site', 'Bitcoin mining facility in Uruguay'),
      ]),
    };

    await searchSubject(pool, tether!, 'primary', {
      provider,
      sceneId: null,
      attemptedUrls: new Set(),
      throwOnProviderFailure: true,
    });

    expect(
      subjectEntries(pool, tether!.key).map((entry) => entry.candidate.altText),
    ).toEqual(['Bitcoin mining facility in Uruguay']);
  });

  it('does not let cross-subject fallback hand a named scene an image that explicitly names a different episode subject', async () => {
    const subjects = deriveSearchSubjects([tetherScene, orsiScene]);
    const tether = subjects.find((subject) => subject.label === 'Tether');
    const orsi = subjects.find((subject) => subject.label === 'Yamandú Orsi');
    expect(tether).toBeDefined();
    expect(orsi).toBeDefined();

    const pool = createEpisodeImagePool(subjects);
    const provider: ImageSearchProvider = {
      origin: 'brave',
      maxResults: 100,
      search: vi.fn().mockImplementation((query: string) => {
        if (query === tether!.query) {
          return Promise.resolve([
            braveResult(
              'tether-generic',
              'Stablecoin reserves and Bitcoin mining',
            ),
          ]);
        }
        return Promise.resolve([
          braveResult(
            'orsi',
            'Yamandú Orsi',
            'https://simple.wikipedia.org/wiki/Yamand%C3%BA_Orsi',
          ),
        ]);
      }),
    };

    await searchSubject(pool, tether!, 'primary', {
      provider,
      sceneId: null,
      attemptedUrls: new Set(),
      throwOnProviderFailure: true,
    });
    await searchSubject(pool, orsi!, 'primary', {
      provider,
      sceneId: null,
      attemptedUrls: new Set(),
      throwOnProviderFailure: true,
    });

    const fallback = rankFallbackEntries(pool, tetherScene, [], new Map());
    expect(fallback.map((entry) => entry.candidate.altText)).toEqual([
      'Stablecoin reserves and Bitcoin mining',
    ]);
  });
});
