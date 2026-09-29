import { describe, expect, it } from 'vitest';

import { visualSearchDebug } from './podcast-visual-search-debug.js';

describe('visual search debug missing branches', () => {
  it('drops subjects without string id and name', () => {
    const result = visualSearchDebug({
      subjectCatalog: {
        subjects: [
          { id: 123, canonicalName: 'Cats' },
          { id: 's1', canonicalName: 456 },
          { id: 's2', canonicalName: 'Dogs' },
        ],
        primarySubjectId: 'missing-id',
      },
      imageSearch: {
        requests: [
          {
            query: 'dogs',
            kind: 'primary',
            subjectLabel: 'Dogs',
            returned: 1,
            viable: 1,
            drops: [],
            candidates: [],
            error: null,
          },
        ],
      },
    });

    expect(result?.subjects).toEqual([{ id: 's2', name: 'Dogs' }]);
    // primarySubjectId not found falls back to the id itself
    expect(result?.primarySubject).toBe('missing-id');
  });

  it('reads a null selection reason as null', () => {
    const result = visualSearchDebug({
      plannedQueries: [
        {
          sceneId: 'scene-01',
          queries: ['cats'],
          subjectIds: [],
          selectionReason: 123,
        },
      ],
    });

    expect(result?.plannedQueries[0]).toMatchObject({
      sceneId: 'scene-01',
      selectionReason: null,
    });
  });

  it('drops drops without a string reason', () => {
    const result = visualSearchDebug({
      imageSearch: {
        requests: [
          {
            query: 'cats',
            drops: [
              { reason: 123, count: 2 },
              { reason: 'dup', count: 1 },
            ],
          },
        ],
      },
    });

    expect(result?.actualSearches[0]?.drops).toEqual([
      { reason: 'dup', count: 1 },
    ]);
  });

  it('keeps the first scene for a repeated query-rank pair', () => {
    const result = visualSearchDebug({
      imageSearch: {
        scenes: [
          {
            sceneId: 'scene-01',
            selection: 'winner',
            sourceQuery: 'cats',
            providerRank: 0,
          },
          {
            sceneId: 'scene-02',
            selection: 'winner',
            sourceQuery: 'cats',
            providerRank: 0,
          },
        ],
        requests: [
          {
            query: 'cats',
            candidates: [
              {
                imageUrl: 'https://example.com/i.jpg',
                sourceUrl: 'https://example.com/s',
                providerRank: 0,
              },
            ],
          },
        ],
      },
    });

    expect(result?.actualSearches[0]?.candidates[0]?.selectedBySceneId).toBe(
      'scene-01',
    );
  });

  it('falls back through label keys and drops non-string queries', () => {
    const result = visualSearchDebug({
      imageSearch: {
        primarySubjects: [
          { query: 123, subjectLabel: 'x' },
          { query: 'q1', label: 'L1' },
          { query: 'q2', subjectKey: 'K2' },
          { query: 'q3' },
        ],
      },
    });

    expect(result?.primarySubjects).toEqual([
      { label: 'L1', query: 'q1' },
      { label: 'K2', query: 'q2' },
      { label: 'q3', query: 'q3' },
    ]);
  });

  it('ignores assets and scenes without usable urls', () => {
    const result = visualSearchDebug({
      assets: [
        { r2Url: 123, assetId: 'bad-url' },
        { r2Url: 'https://cdn.example/good.png', assetId: 456 },
        { r2Url: 'https://cdn.example/good.png', assetId: 'good-asset' },
      ],
      visualPlan: {
        scenes: [
          { sceneId: 'scene-01' },
          { sceneId: 'scene-02', asset: { url: 123 } },
          {
            sceneId: 'scene-03',
            asset: { url: 'https://cdn.example/unknown.png' },
          },
          {
            sceneId: 'scene-04',
            asset: { url: 'https://cdn.example/good.png' },
          },
        ],
      },
      imageSearch: {
        requests: [
          {
            query: 'cats',
            kind: 'primary',
            subjectLabel: 'Cats',
            returned: 1,
            viable: 1,
            drops: [],
            candidates: [],
            error: null,
          },
        ],
      },
    });

    // Only one use of the good asset: no reuse reported.
    expect(result?.reuse).toEqual([]);
  });
});
