import { describe, expect, it } from 'vitest';

import { visualSearchDebug } from './podcast-visual-search-debug.js';

describe('visual search debug coverage gaps', () => {
  it('returns null for an empty payload', () => {
    expect(visualSearchDebug(null)).toBeNull();
    expect(visualSearchDebug({})).toBeNull();
    expect(visualSearchDebug({ phase: 'running' })).toBeNull();
  });

  it('drops planned queries without queries', () => {
    const result = visualSearchDebug({
      plannedQueries: [
        {
          sceneId: 'scene-01',
          queries: [],
          subjectIds: [],
          selectionReason: 'r',
        },
        { sceneId: 'scene-02', queries: 'not-an-array' },
        { sceneId: 123, queries: ['q'] },
      ],
      imageSearch: {
        requests: [
          {
            query: 'cats',
            kind: 'primary',
            subjectLabel: 'Cats',
            returned: 5,
            viable: 3,
            drops: [],
            candidates: [],
            error: null,
          },
        ],
      },
    });

    expect(result).not.toBeNull();
    expect(result?.plannedQueries).toEqual([]);
    expect(result?.actualSearches).toHaveLength(1);
    expect(result?.actualSearches[0]).toMatchObject({
      query: 'cats',
      kind: 'primary',
    });
  });

  it('drops image-search requests without a string query', () => {
    const result = visualSearchDebug({
      imageSearch: {
        requests: [
          { query: 123 },
          { query: 'dogs', kind: 'weird', subjectKey: '  ' },
        ],
      },
    });

    expect(result?.actualSearches).toHaveLength(1);
    expect(result?.actualSearches[0]).toMatchObject({
      query: 'dogs',
      kind: null,
    });
  });

  it('drops candidates without both urls', () => {
    const result = visualSearchDebug({
      imageSearch: {
        requests: [
          {
            query: 'birds',
            candidates: [
              { imageUrl: null, sourceUrl: 'https://example.com/s' },
              { imageUrl: 'https://example.com/i.jpg', sourceUrl: null },
              {
                imageUrl: 'https://example.com/i.jpg',
                sourceUrl: 'https://example.com/s',
                altText: '  ',
                providerRank: 1,
                dropReason: 'dup',
              },
            ],
          },
        ],
      },
    });

    expect(result?.actualSearches[0]?.candidates).toHaveLength(1);
    expect(result?.actualSearches[0]?.candidates[0]).toMatchObject({
      imageUrl: 'https://example.com/i.jpg',
      altText: null,
    });
  });

  it('drops scene selections without a string selection', () => {
    const result = visualSearchDebug({
      imageSearch: {
        scenes: [
          { sceneId: 'scene-01', selection: 123 },
          { sceneId: 456, selection: 'winner' },
          {
            sceneId: 'scene-02',
            selection: 'winner',
            fallbackReason: 'x',
            matchedSubjectKey: 'k',
            sourceQuery: 'q',
            providerRank: 0,
          },
        ],
      },
    });

    expect(result?.sceneSelections).toHaveLength(1);
    expect(result?.sceneSelections[0]).toMatchObject({ sceneId: 'scene-02' });
  });

  it('sorts reuse ties by asset id', () => {
    const result = visualSearchDebug({
      assets: [
        { r2Url: 'https://cdn.example/b.png', assetId: 'b-asset' },
        { r2Url: 'https://cdn.example/a.png', assetId: 'a-asset' },
      ],
      visualPlan: {
        scenes: [
          { sceneId: 'scene-01', asset: { url: 'https://cdn.example/b.png' } },
          { sceneId: 'scene-02', asset: { url: 'https://cdn.example/b.png' } },
          { sceneId: 'scene-03', asset: { url: 'https://cdn.example/a.png' } },
          { sceneId: 'scene-04', asset: { url: 'https://cdn.example/a.png' } },
        ],
      },
    });

    // Both assets used twice: the tie-breaker orders by assetId.
    expect(result?.reuse).toEqual([
      { assetId: 'a-asset', useCount: 2 },
      { assetId: 'b-asset', useCount: 2 },
    ]);
  });

  it('drops legacy search-trace rows without provider and intent', () => {
    const result = visualSearchDebug({
      searchTrace: [
        { sceneId: 'scene-01', provider: 123, intent: 'cats' },
        { sceneId: 'scene-02', provider: 'brave', intent: 456 },
        {
          sceneId: 'scene-03',
          provider: 'brave',
          intent: 'dogs',
          subjectKey: 'dogs',
          returned: 4,
          accepted: 2,
          entityFiltered: 1,
          rejected: 0,
        },
      ],
    });

    expect(result?.actualSearches).toHaveLength(1);
    expect(result?.actualSearches[0]).toMatchObject({
      sceneId: 'scene-03',
      provider: 'brave',
      query: 'dogs',
    });
  });
});
