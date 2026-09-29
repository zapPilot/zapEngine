import { describe, expect, it, vi } from 'vitest';

import type { ImageCandidate } from '../../types.js';
import {
  canSearch,
  createEpisodeImagePool,
  deriveSearchSubjects,
  fallbackEntryMatchesSceneQuery,
  hasSearched,
  markAttempted,
  plannedPrimarySubjects,
  type PoolEntry,
  poolSkippedForBudget,
  poolSubject,
  rankFallbackEntries,
  type SearchSubject,
  searchSubject,
  subjectEntries,
  subjectIsDirectlyAnchored,
  subjectRequestError,
  summarizePool,
} from './episode-image-pool.js';
import type { ImageSearchProvider } from './image-search-provider.js';

function subject(overrides: Partial<SearchSubject> = {}): SearchSubject {
  return {
    key: 'nvidia',
    label: 'NVIDIA',
    query: 'NVIDIA GPU',
    sceneIds: ['scene-01'],
    directlyAnchored: true,
    subjectType: 'company',
    ...overrides,
  };
}

function candidate(id: string, altText = 'NVIDIA GPU'): ImageCandidate {
  return {
    imageUrl: `https://images.example.test/${id}.jpg`,
    sourceUrl: `https://publisher.example.test/${id}`,
    origin: 'brave',
    width: 1600,
    height: 900,
    altText,
  };
}

function entry(overrides: Partial<PoolEntry> = {}): PoolEntry {
  return {
    candidate: candidate('one'),
    canonicalUrl: 'https://images.example.test/one.jpg',
    queryKeys: ['nvidia gpu'],
    providerRank: 1,
    requestSubjectKey: 'nvidia',
    requestQuery: 'NVIDIA GPU',
    attempted: false,
    ...overrides,
  };
}

describe('episode image pool coverage edges', () => {
  it('derives no subject from an empty scene and handles implicit context/direct anchors', () => {
    expect(
      deriveSearchSubjects([
        { sceneId: 'scene-01', imageSearchIntent: [], imageSearchEntities: [] },
      ]),
    ).toEqual([]);
    expect(
      subjectIsDirectlyAnchored({
        sceneId: 'scene-01',
        imageSearchIntent: ['market'],
      }),
    ).toBe(false);
    expect(
      subjectIsDirectlyAnchored({
        sceneId: 'scene-01',
        imageSearchIntent: ['market'],
        imageSearchEntities: ['NVIDIA'],
      }),
    ).toBe(true);
  });

  it('groups repeated scenes under one subject and upgrades it to directly anchored', () => {
    expect(
      deriveSearchSubjects([
        {
          sceneId: 'scene-01',
          imageSearchIntent: ['NVIDIA GPU'],
          imageSearchEntities: ['NVIDIA'],
          searchAnchor: 'context',
        },
        {
          sceneId: 'scene-02',
          imageSearchIntent: ['NVIDIA GPU'],
          imageSearchEntities: ['NVIDIA'],
          searchAnchor: 'direct',
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        key: 'nvidia',
        sceneIds: ['scene-01', 'scene-02'],
        directlyAnchored: true,
      }),
    ]);
  });

  it('deduplicates primary queries and exposes missing subject lookups', () => {
    expect(
      plannedPrimarySubjects([
        subject(),
        subject({
          key: 'duplicate',
          label: 'Duplicate',
          query: ' NVIDIA   GPU ',
        }),
      ]),
    ).toHaveLength(1);
    const pool = createEpisodeImagePool([subject()]);
    expect(poolSubject(pool, 'missing')).toBeNull();
    expect(subjectRequestError(pool, 'missing')).toBeNull();
    expect(subjectEntries(pool, 'missing')).toEqual([]);
    expect(hasSearched(pool, 'missing')).toBe(false);
  });

  it('caps the planned primary pass at five unique queries', () => {
    const subjects = Array.from({ length: 6 }, (_, index) =>
      subject({
        key: `subject-${index}`,
        label: `Subject ${index}`,
        query: `Subject ${index} headquarters`,
      }),
    );
    expect(plannedPrimarySubjects(subjects)).toHaveLength(5);
  });

  it('returns null without a provider, for a duplicate query, and when budget is exhausted', async () => {
    const item = subject();
    const pool = createEpisodeImagePool([item]);
    const base = {
      provider: null,
      sceneId: null,
      attemptedUrls: new Set<string>(),
      throwOnProviderFailure: false,
    };
    await expect(
      searchSubject(pool, item, 'primary', base),
    ).resolves.toBeNull();

    pool.requestedQueryKeys.add('nvidia gpu');
    const provider: ImageSearchProvider = {
      origin: 'brave',
      search: vi.fn().mockResolvedValue([]),
    };
    await expect(
      searchSubject(pool, item, 'primary', { ...base, provider }),
    ).resolves.toBeNull();

    pool.requestedQueryKeys.clear();
    pool.requestCounts.primary = 5;
    pool.requestCounts.targeted = 3;
    expect(canSearch(pool, 'primary')).toBe(false);
    await expect(
      searchSubject(pool, item, 'primary', { ...base, provider }),
    ).resolves.toBeNull();
    expect(poolSkippedForBudget(pool)).toBe(1);
  });

  it('uses the generic provider error when the thrown value has no message', async () => {
    const item = subject();
    const provider: ImageSearchProvider = {
      origin: 'brave',
      // A bare empty-string rejection exercises the `|| 'image search failed'`
      // fallback without tripping `unicorn/error-message`.
      search: vi.fn().mockRejectedValue(''),
    };
    const pool = createEpisodeImagePool([item]);
    await searchSubject(pool, item, 'primary', {
      provider,
      sceneId: null,
      attemptedUrls: new Set(),
      throwOnProviderFailure: false,
    });
    expect(subjectRequestError(pool, item.key)).toBe('image search failed');
  });

  it('records a resilient provider failure and rethrows strict or abort failures', async () => {
    const item = subject();
    const provider: ImageSearchProvider = {
      origin: 'brave',
      search: vi.fn().mockRejectedValue(new Error('provider down')),
    };
    const pool = createEpisodeImagePool([item]);
    await searchSubject(pool, item, 'primary', {
      provider,
      sceneId: null,
      attemptedUrls: new Set(),
      throwOnProviderFailure: false,
    });
    expect(subjectRequestError(pool, item.key)).toBe('provider down');
    expect(summarizePool(pool)).toMatchObject({ returned: 0, viable: 0 });

    await expect(
      searchSubject(createEpisodeImagePool([item]), item, 'primary', {
        provider,
        sceneId: null,
        attemptedUrls: new Set(),
        throwOnProviderFailure: true,
      }),
    ).rejects.toThrow('provider down');

    const controller = new AbortController();
    controller.abort();
    await expect(
      searchSubject(createEpisodeImagePool([item]), item, 'primary', {
        provider,
        sceneId: null,
        attemptedUrls: new Set(),
        signal: controller.signal,
        throwOnProviderFailure: false,
      }),
    ).rejects.toThrow();
  });

  it('covers fallback matching for context, empty vocabularies, and actual overlap', () => {
    expect(
      fallbackEntryMatchesSceneQuery(
        { requestQuery: 'anything' },
        {
          imageSearchIntent: [],
          searchAnchor: 'context',
        },
      ),
    ).toBe(true);
    expect(
      fallbackEntryMatchesSceneQuery(
        { requestQuery: '123 456' },
        { imageSearchIntent: ['the and'] },
      ),
    ).toBe(true);
    expect(
      fallbackEntryMatchesSceneQuery(
        { requestQuery: 'NVIDIA GPU launch' },
        { imageSearchIntent: ['NVIDIA earnings'] },
      ),
    ).toBe(true);
  });

  it('ranks a context fallback scene whose search intent is empty', () => {
    const generic = subject({ key: 'intent:market', label: 'market' });
    const pool = createEpisodeImagePool([generic]);
    pool.entries.set(
      'one',
      entry({ canonicalUrl: 'one', requestSubjectKey: generic.key }),
    );
    expect(
      rankFallbackEntries(
        pool,
        { sceneId: 'scene-01', imageSearchIntent: [], searchAnchor: 'context' },
        [],
        new Map(),
      ),
    ).toHaveLength(1);
  });

  it('marks an external entry attempted and penalizes repeated fallback draws', () => {
    const pool = createEpisodeImagePool([subject()]);
    const external = entry();
    markAttempted(pool, external);
    expect(external.attempted).toBe(true);

    pool.entries.set('one', entry({ canonicalUrl: 'one' }));
    const ranked = rankFallbackEntries(
      pool,
      {
        sceneId: 'scene-01',
        imageSearchIntent: ['NVIDIA GPU'],
        imageSearchEntities: ['NVIDIA'],
      },
      [],
      new Map([['nvidia', 2]]),
    );
    expect(ranked).toHaveLength(1);
  });

  it('summarizes repeated drop causes and attempted pool entries', () => {
    const pool = createEpisodeImagePool([subject()]);
    pool.requests.push({
      kind: 'primary',
      subjectKey: 'nvidia',
      subjectLabel: 'NVIDIA',
      query: 'NVIDIA GPU',
      sceneId: null,
      returned: 3,
      viable: 1,
      drops: [
        { reason: 'decorative', count: 1 },
        { reason: 'decorative', count: 1 },
      ],
      candidates: [],
      error: null,
    });
    pool.entries.set('one', entry({ canonicalUrl: 'one', attempted: true }));
    expect(summarizePool(pool)).toMatchObject({
      attempted: 1,
      returned: 3,
      viable: 1,
    });
    expect(summarizePool(pool).drops.get('decorative')).toBe(2);
  });

  it('accepts generic intent subjects in fallback ranking and rejects an explicitly different named subject', () => {
    const generic = subject({ key: 'intent:market', label: 'market' });
    const pool = createEpisodeImagePool([
      generic,
      subject({ key: 'nvidia', label: 'NVIDIA' }),
      subject({ key: 'amd', label: 'AMD', query: 'AMD GPU' }),
    ]);
    pool.entries.set(
      'generic',
      entry({
        canonicalUrl: 'generic',
        candidate: candidate('generic', 'market overview'),
        requestSubjectKey: generic.key,
        requestQuery: generic.query,
      }),
    );
    pool.entries.set(
      'amd',
      entry({
        canonicalUrl: 'amd',
        candidate: candidate('amd', 'AMD headquarters'),
        requestSubjectKey: 'amd',
        requestQuery: 'AMD GPU',
      }),
    );

    expect(
      rankFallbackEntries(
        pool,
        {
          sceneId: 'scene-01',
          imageSearchIntent: ['market'],
          searchAnchor: 'context',
        },
        [],
        new Map(),
      ),
    ).not.toHaveLength(0);
    expect(
      rankFallbackEntries(
        pool,
        {
          sceneId: 'scene-02',
          imageSearchIntent: ['NVIDIA GPU'],
          imageSearchEntities: ['NVIDIA'],
        },
        [],
        new Map(),
      ).some((ranked) => ranked.canonicalUrl === 'amd'),
    ).toBe(false);
  });

  it('keeps the first provider rank when the provider repeats an image URL', async () => {
    const item = subject();
    const repeated = candidate('shared');
    const pool = createEpisodeImagePool([item]);
    const provider: ImageSearchProvider = {
      origin: 'brave',
      search: vi
        .fn()
        .mockResolvedValue([
          repeated,
          { ...repeated, altText: 'duplicate result' },
        ]),
    };
    await searchSubject(pool, item, 'primary', {
      provider,
      sceneId: null,
      attemptedUrls: new Set(),
      throwOnProviderFailure: true,
    });
    expect([...pool.entries.values()][0]?.providerRank).toBe(0);
  });

  it('merges the same accepted image across two distinct queries', async () => {
    const first = subject();
    const second = subject({ key: 'gpu-maker', query: 'GPU maker NVIDIA' });
    const pool = createEpisodeImagePool([first, second]);
    const provider: ImageSearchProvider = {
      origin: 'brave',
      search: vi.fn().mockResolvedValue([candidate('shared')]),
    };
    for (const item of [first, second]) {
      await searchSubject(pool, item, 'primary', {
        provider,
        sceneId: null,
        attemptedUrls: new Set(),
        throwOnProviderFailure: true,
      });
    }
    const shared = [...pool.entries.values()][0]!;
    expect(shared.queryKeys).toHaveLength(2);
    expect(shared.providerRank).toBe(0);
  });
});
