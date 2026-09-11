import { describe, expect, it, vi } from 'vitest';

import type { ImageCandidate } from '../../types.js';
import {
  createEpisodeImagePool,
  deriveSearchSubjects,
  type PoolEntry,
  rankEntriesForScene,
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
      search: vi
        .fn()
        .mockResolvedValue([
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

describe('episode image pool visual cue ranking', () => {
  function poolEntry(
    id: string,
    altText: string,
    providerRank: number,
  ): PoolEntry {
    return {
      candidate: braveResult(id, altText),
      canonicalUrl: `https://images.example.test/${id}.jpg`,
      queryKeys: ['nvidia gpu maker'],
      providerRank,
      requestSubjectKey: 'nvidia',
      requestQuery: 'NVIDIA GPU maker',
      attempted: false,
    };
  }

  const cueScene = {
    sceneId: 'scene-01',
    imageSearchIntent: ['NVIDIA GPU maker'],
    imageSearchEntities: ['NVIDIA'],
    visualCue: 'stock chart plunge',
    searchAnchor: 'direct' as const,
    subjectType: 'company',
  };

  it('lets a cue hit beat a better provider rank through sceneEntryScore', () => {
    const ranked = rankEntriesForScene(
      [
        poolEntry('plain-hall', 'server hall at night', 0),
        poolEntry('cue-photo', 'stock chart plunge', 5),
      ],
      cueScene,
      [],
    );
    expect(ranked.map((entry) => entry.candidate.altText)).toEqual([
      'stock chart plunge',
      'server hall at night',
    ]);
  });

  it('still ranks an entity mention above a cue hit', () => {
    const ranked = rankEntriesForScene(
      [
        poolEntry('cue-photo', 'stock chart plunge', 0),
        poolEntry('entity-photo', 'NVIDIA press conference', 5),
      ],
      cueScene,
      [],
    );
    expect(ranked.map((entry) => entry.candidate.altText)).toEqual([
      'NVIDIA press conference',
      'stock chart plunge',
    ]);
  });
});
