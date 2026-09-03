import { describe, expect, it } from 'vitest';

import type { PodcastPipelineVisualDebug } from '../../shared/podcast-pipeline.js';
import { summarizePodcastPipeline } from './podcast-pipeline.js';

// The completed shape mirrors `episodeVisualPayloadSchema`
// (apps/podcast-pipeline/src/services/video/episode-visual.ts) and
// `materializedVisualSceneSchema` (.../video/storyboard/visual-plan.ts) key for
// key, including the fields this view never reads. A fixture written to the
// paths the reader happened to expect is what let the reader drift off the
// paths production actually writes.
const completedVisualPayload = {
  schemaVersion: 'podcast-episode-visual.v1',
  visualVersion: 'visual-v9',
  visualHash: 'a'.repeat(64),
  episodeId: '826f4b87-6278-4275-bff5-535ba5ef438d',
  canonicalLocalizationId: 'd3f1c2b4-5a67-489b-9c0d-1e2f3a4b5c6d',
  manifestUrl: 'https://cdn.example.com/visual/manifest.json',
  visualPlan: {
    schemaVersion: 'podcast-image-visual-plan.v1',
    scenes: [
      {
        sceneId: 'scene-01',
        startSentenceId: 's0001',
        endSentenceId: 's0004',
        imageSearchIntent: ['a16z AI writing', 'a16z'],
        imageSearchEntities: ['a16z'],
        sources: [
          {
            id: 'source-pexels-01',
            label: 'Pexels',
            url: 'https://www.pexels.com/photo/1',
            attribution: 'Photo via Pexels',
            license: 'pexels',
            licenseUrl: 'https://www.pexels.com/license/',
          },
        ],
        asset: {
          kind: 'remoteImage',
          sourceId: 'source-pexels-01',
          url: 'https://cdn.example.com/visual/image-01.jpg',
          sha256: 'b'.repeat(64),
          layout: 'fullBleed',
          position: 'center',
          motion: 'pushIn',
        },
      },
      // Every packaged episode's plan ends with the Zap Pilot outro card, which
      // is a bundled PNG rather than anything image search was asked for.
      {
        sceneId: 'scene-02',
        startSentenceId: 's0005',
        endSentenceId: 's0005',
        imageSearchIntent: ['brand:zap-pilot-outro'],
        sources: [
          {
            id: 'source-brand-outro',
            label: 'Zap Pilot',
            url: null,
            attribution: 'Zap Pilot',
            license: 'brand-generated',
            licenseUrl: null,
          },
        ],
        asset: {
          kind: 'remoteImage',
          sourceId: 'source-brand-outro',
          url: 'https://cdn.example.com/visual/image-02.png',
          sha256: 'd'.repeat(64),
          layout: 'contain',
          position: 'center',
          motion: 'static',
        },
      },
    ],
  },
  assets: [
    {
      assetId: 'image-01',
      r2Url: 'https://cdn.example.com/visual/image-01.jpg',
      originalImageUrl: 'https://images.pexels.com/photos/1.jpg',
      sourcePageUrl: 'https://www.pexels.com/photo/1',
      provider: 'pexels',
      license: 'pexels',
      contentType: 'image/jpeg',
      sha256: 'b'.repeat(64),
      perceptualHash: 'c'.repeat(16),
      width: 1920,
      height: 1080,
    },
    {
      assetId: 'image-02',
      r2Url: 'https://cdn.example.com/visual/image-02.png',
      originalImageUrl: 'https://cdn.example.com/visual/image-02.png',
      sourcePageUrl: 'https://zap-pilot.org',
      provider: 'brand',
      license: 'brand-generated',
      contentType: 'image/png',
      sha256: 'd'.repeat(64),
      perceptualHash: 'e'.repeat(16),
      width: 720,
      height: 1280,
    },
  ],
  subjectCatalog: {
    primarySubjectId: 'subject-a16z',
    subjects: [
      {
        id: 'subject-a16z',
        canonicalName: 'a16z',
        type: 'company',
        aliases: ['Andreessen Horowitz'],
        storyRole: 'primary',
        evidenceSceneIds: ['scene-01'],
        searchQueries: ['a16z AI writing', 'a16z'],
        identityHints: ['venture capital firm'],
        negativeHints: ['a16 bus route'],
        officialDomains: ['a16z.com'],
      },
    ],
  },
  sceneAssignments: [
    {
      sceneId: 'scene-01',
      subjectIds: ['subject-a16z'],
      selectionReason: 'direct',
    },
  ],
  provenance: {
    storyboardProvider: 'openrouter',
    storyboardModel: 'openrouter/free',
    storyboardPromptVersion: 'image-storyboard-v2',
    usedFallback: false,
    searchIntentModel: null,
    searchTitleSource: 'publisher',
    articleImageCandidateCount: 3,
    articleImageAssetCount: 1,
    searchTrace: [
      {
        sceneId: 'scene-01',
        provider: 'pexels',
        intent: 'a16z AI writing',
        subjectKey: 'subject-a16z',
        returned: 12,
        accepted: 0,
        entityFiltered: 12,
        rejected: 0,
      },
      {
        sceneId: 'scene-01',
        provider: 'brave',
        intent: 'a16z',
        subjectKey: 'subject-a16z',
        returned: 20,
        accepted: 4,
        entityFiltered: 2,
        rejected: 1,
      },
    ],
  },
} as const;

// One view row per stored per-scene trace entry, in order. The legacy trace
// counted its two removal buckets in dedicated columns, so they are read back as
// drop reasons — `entity-filtered` among them, which is the gate this rollout
// deleted and which old payloads still record.
function searchRowFor(
  trace: (typeof completedVisualPayload)['provenance']['searchTrace'][number],
): PodcastPipelineVisualDebug['actualSearches'][number] {
  return {
    sceneId: trace.sceneId,
    provider: trace.provider,
    kind: null,
    subjectLabel: trace.subjectKey,
    query: trace.intent,
    returned: trace.returned,
    viable: trace.accepted,
    drops: [
      { reason: 'entity-filtered', count: trace.entityFiltered },
      { reason: 'rejected', count: trace.rejected },
    ].filter(({ count }) => count > 0),
    error: null,
  };
}

// Mirrors `visualImageSearchSchema`
// (apps/podcast-pipeline/src/services/video/image-search-trace.ts) key for key.
// Every subject is searched once for the whole episode, so two of the three
// requests belong to no scene at all.
const episodeImageSearch = {
  requestCount: 3,
  budget: { primary: 5, targeted: 3, max: 8 },
  budgetExhausted: false,
  primarySubjects: [
    {
      subjectKey: 'a16z',
      subjectLabel: 'a16z',
      query: 'a16z venture capital firm',
      sceneCount: 2,
    },
    {
      subjectKey: 'justin sun',
      subjectLabel: 'Justin Sun',
      query: 'Justin Sun',
      sceneCount: 1,
    },
  ],
  requests: [
    {
      kind: 'primary',
      subjectKey: 'a16z',
      subjectLabel: 'a16z',
      query: 'a16z venture capital firm',
      sceneId: null,
      returned: 100,
      viable: 41,
      drops: [
        { reason: 'decorative-asset', count: 38 },
        { reason: 'text-card-publisher', count: 21 },
      ],
      error: null,
    },
    {
      kind: 'primary',
      subjectKey: 'justin sun',
      subjectLabel: 'Justin Sun',
      query: 'Justin Sun',
      sceneId: null,
      returned: 0,
      viable: 0,
      drops: [],
      error: 'brave images request failed with 429',
    },
    {
      kind: 'targeted',
      subjectKey: 'a16z',
      subjectLabel: 'a16z',
      query: 'a16z office',
      sceneId: 'scene-03',
      returned: 40,
      viable: 12,
      drops: [],
      error: null,
    },
  ],
  scenes: [
    {
      sceneId: 'scene-01',
      subjectKey: 'a16z',
      matchedSubjectKey: 'a16z',
      selection: 'pool',
      sourceQuery: 'a16z venture capital firm',
      providerRank: 0,
      fallbackReason: null,
      rejections: [],
    },
    {
      sceneId: 'scene-02',
      subjectKey: 'justin sun',
      matchedSubjectKey: 'a16z',
      selection: 'pool-fallback',
      sourceQuery: 'a16z venture capital firm',
      providerRank: 4,
      fallbackReason: 'provider-failure',
      rejections: [{ cause: 'perceptual-duplicate', count: 2 }],
    },
    {
      sceneId: 'scene-03',
      subjectKey: null,
      matchedSubjectKey: null,
      selection: 'generated-slide',
      sourceQuery: null,
      providerRank: null,
      fallbackReason: 'pool-exhausted',
      rejections: [],
    },
  ],
} as const;

function visualDebugFor(
  visualPayload: Record<string, unknown>,
  status: string,
): PodcastPipelineVisualDebug | null {
  const [episode] = summarizePodcastPipeline(
    [
      {
        id: 'episode-1',
        source_title: 'a16z AI writing guide',
        source_url: 'https://example.com/a16z',
        created_at: '2026-09-03T00:00:00.000Z',
      },
    ] as never,
    [],
    [],
    [
      {
        episode_id: 'episode-1',
        status,
        progress_percent: 100,
        progress_stage: status,
        attempt_count: 1,
        lease_expires_at: null,
        last_error: null,
        updated_at: '2026-09-03T00:20:00.000Z',
        visual_payload: visualPayload,
      },
    ] as never,
    [],
    new Date('2026-09-03T01:00:00.000Z'),
  );
  return episode?.visualDebug ?? null;
}

describe('podcast pipeline visual diagnostics', () => {
  it('surfaces subjects and planned queries from a failed visual checkpoint', () => {
    const now = new Date('2026-09-03T01:00:00.000Z');
    const episodes = [
      {
        id: 'episode-1',
        source_title: 'a16z AI writing guide',
        source_url: 'https://example.com/a16z',
        created_at: '2026-09-03T00:00:00.000Z',
      },
    ];
    const localizations = ['zh-Hant', 'ja', 'en'].map(
      (language_code, index) => ({
        id: `loc-${index}`,
        episode_id: 'episode-1',
        language_code,
        status: 'completed',
        script: 'ready',
        hls_url: 'https://example.com/audio.m3u8',
        classroom_hls_url:
          language_code === 'zh-Hant'
            ? 'https://example.com/classroom.m3u8'
            : null,
        updated_at: '2026-09-03T00:10:00.000Z',
      }),
    );
    const visuals = [
      {
        episode_id: 'episode-1',
        status: 'failed',
        progress_percent: 35,
        progress_stage: 'planning-scenes',
        attempt_count: 3,
        lease_expires_at: null,
        last_error: 'image provider failed',
        updated_at: '2026-09-03T00:20:00.000Z',
        visual_payload: {
          schemaVersion: 'visual-search-debug-v1',
          phase: 'planned',
          subjectCatalog: {
            primarySubjectId: 'subject-a16z',
            subjects: [{ id: 'subject-a16z', canonicalName: 'a16z' }],
          },
          plannedQueries: [
            {
              sceneId: 'scene-01',
              subjectIds: ['subject-a16z'],
              selectionReason: 'direct',
              queries: ['a16z'],
            },
          ],
        },
      },
    ];

    const [episode] = summarizePodcastPipeline(
      episodes as never,
      [],
      localizations as never,
      visuals as never,
      [],
      now,
    );

    expect(episode?.visualDebug).toEqual({
      phase: 'planned',
      primarySubject: 'a16z',
      subjects: [{ id: 'subject-a16z', name: 'a16z' }],
      budget: null,
      primarySubjects: [],
      plannedSubjectSearches: [],
      plannedQueries: [
        {
          sceneId: 'scene-01',
          subjectIds: ['subject-a16z'],
          selectionReason: 'direct',
          queries: ['a16z'],
        },
      ],
      actualSearches: [],
      sceneSelections: [],
      reuse: [],
      subjectCatalogFailure: null,
    });
  });

  it('reads a completed payload from provenance.searchTrace and visualPlan.scenes', () => {
    const debug = visualDebugFor(completedVisualPayload, 'completed');

    expect(debug?.actualSearches).toEqual(
      completedVisualPayload.provenance.searchTrace.map(searchRowFor),
    );
    // scene-02 is the brand outro: it is in the plan but image search never ran
    // for it, so reporting it as a planned query would invent a search on every
    // packaged episode.
    expect(debug?.plannedQueries).toEqual([
      {
        sceneId: 'scene-01',
        subjectIds: [],
        selectionReason: null,
        queries: ['a16z AI writing', 'a16z'],
      },
    ]);
    expect(debug?.primarySubject).toBe('a16z');
  });

  it('reads a transient search checkpoint from its top-level searchTrace', () => {
    const debug = visualDebugFor(
      {
        schemaVersion: 'visual-search-debug-v1',
        phase: 'search-failed',
        searchTitleSource: 'publisher',
        searchIntentModel: null,
        subjectCatalog: completedVisualPayload.subjectCatalog,
        sceneAssignments: completedVisualPayload.sceneAssignments,
        plannedQueries: [
          {
            sceneId: 'scene-01',
            subjectIds: ['subject-a16z'],
            selectionReason: 'direct',
            queries: ['a16z AI writing'],
          },
        ],
        searchTrace: [
          {
            sceneId: 'scene-01',
            provider: 'pixabay',
            intent: 'a16z AI writing',
            subjectKey: 'subject-a16z',
            returned: 8,
            accepted: 0,
            entityFiltered: 8,
            rejected: 0,
          },
        ],
      },
      'processing',
    );

    expect(debug?.phase).toBe('search-failed');
    expect(debug?.actualSearches).toEqual([
      {
        sceneId: 'scene-01',
        provider: 'pixabay',
        kind: null,
        subjectLabel: 'subject-a16z',
        query: 'a16z AI writing',
        returned: 8,
        viable: 0,
        drops: [{ reason: 'entity-filtered', count: 8 }],
        error: null,
      },
    ]);
    expect(debug?.plannedQueries).toEqual([
      {
        sceneId: 'scene-01',
        subjectIds: ['subject-a16z'],
        selectionReason: 'direct',
        queries: ['a16z AI writing'],
      },
    ]);
  });
  it('lists every episode-wide Brave request, including the ones no scene owns', () => {
    const debug = visualDebugFor(
      {
        ...completedVisualPayload,
        provenance: {
          ...completedVisualPayload.provenance,
          imageSearch: episodeImageSearch,
        },
      },
      'completed',
    );

    // A primary request builds the pool before any scene owns an image, so
    // scene-keyed parsing would have dropped two of these three rows.
    expect(debug?.actualSearches).toEqual([
      {
        sceneId: null,
        provider: 'brave',
        kind: 'primary',
        subjectLabel: 'a16z',
        query: 'a16z venture capital firm',
        returned: 100,
        viable: 41,
        drops: [
          { reason: 'decorative-asset', count: 38 },
          { reason: 'text-card-publisher', count: 21 },
        ],
        error: null,
      },
      {
        sceneId: null,
        provider: 'brave',
        kind: 'primary',
        subjectLabel: 'Justin Sun',
        query: 'Justin Sun',
        returned: 0,
        viable: 0,
        drops: [],
        error: 'brave images request failed with 429',
      },
      {
        sceneId: 'scene-03',
        provider: 'brave',
        kind: 'targeted',
        subjectLabel: 'a16z',
        query: 'a16z office',
        returned: 40,
        viable: 12,
        drops: [],
        error: null,
      },
    ]);
  });

  it('reports the request budget and the query spent on each primary subject', () => {
    const debug = visualDebugFor(
      { imageSearch: episodeImageSearch },
      'processing',
    );

    expect(debug?.budget).toEqual({
      requestCount: 3,
      max: 8,
      primary: 5,
      targeted: 3,
      exhausted: false,
    });
    expect(debug?.primarySubjects).toEqual([
      { label: 'a16z', query: 'a16z venture capital firm' },
      { label: 'Justin Sun', query: 'Justin Sun' },
    ]);
  });

  it('marks the budget exhausted so a starved episode is not read as a bad search', () => {
    const debug = visualDebugFor(
      {
        imageSearch: {
          ...episodeImageSearch,
          requestCount: 8,
          budgetExhausted: true,
        },
      },
      'processing',
    );

    expect(debug?.budget).toMatchObject({ requestCount: 8, exhausted: true });
  });

  it('records each scene selection with the subject it borrowed and why', () => {
    const debug = visualDebugFor(
      { imageSearch: episodeImageSearch },
      'processing',
    );

    expect(debug?.sceneSelections).toEqual([
      {
        sceneId: 'scene-01',
        selection: 'pool',
        fallbackReason: null,
        matchedSubjectKey: 'a16z',
        sourceQuery: 'a16z venture capital firm',
        providerRank: 0,
      },
      {
        sceneId: 'scene-02',
        selection: 'pool-fallback',
        fallbackReason: 'provider-failure',
        matchedSubjectKey: 'a16z',
        sourceQuery: 'a16z venture capital firm',
        providerRank: 4,
      },
      {
        sceneId: 'scene-03',
        selection: 'generated-slide',
        fallbackReason: 'pool-exhausted',
        matchedSubjectKey: null,
        sourceQuery: null,
        providerRank: null,
      },
    ]);
  });

  it('builds a panel from a payload whose only diagnostic is the image search', () => {
    const debug = visualDebugFor(
      { imageSearch: episodeImageSearch },
      'processing',
    );

    expect(debug).not.toBeNull();
    expect(debug?.subjects).toEqual([]);
    expect(debug?.plannedQueries).toEqual([]);
  });

  it('prefers the episode-wide requests over a legacy per-scene trace', () => {
    const debug = visualDebugFor(
      {
        imageSearch: episodeImageSearch,
        searchTrace: completedVisualPayload.provenance.searchTrace,
      },
      'processing',
    );

    expect(debug?.actualSearches.map(({ query }) => query)).toEqual([
      'a16z venture capital firm',
      'Justin Sun',
      'a16z office',
    ]);
  });

  it('surfaces the planner queries a checkpoint intended to spend', () => {
    const debug = visualDebugFor(
      {
        schemaVersion: 'visual-search-debug-v1',
        phase: 'planned',
        plannedSubjectSearches: [
          {
            subjectKey: 'a16z',
            subjectLabel: 'a16z',
            query: 'a16z venture capital firm',
            sceneCount: 2,
          },
        ],
      },
      'processing',
    );

    expect(debug?.plannedSubjectSearches).toEqual([
      { label: 'a16z', query: 'a16z venture capital firm' },
    ]);
  });

  it('surfaces why a degraded subject catalog is missing, from either payload shape', () => {
    const checkpoint = visualDebugFor(
      {
        schemaVersion: 'visual-search-debug-v1',
        phase: 'subject-catalog-degraded',
        subjectCatalogFailure: 'subject catalog answer named no known subject',
      },
      'processing',
    );

    // The reason alone has to build a panel: a degraded catalog leaves nothing
    // else in the payload to render, and that is exactly the case an operator
    // cannot otherwise tell apart from scenes that name nobody.
    expect(checkpoint).not.toBeNull();
    expect(checkpoint?.subjects).toEqual([]);
    expect(checkpoint?.subjectCatalogFailure).toBe(
      'subject catalog answer named no known subject',
    );

    const completed = visualDebugFor(
      {
        ...completedVisualPayload,
        subjectCatalog: null,
        provenance: {
          ...completedVisualPayload.provenance,
          subjectCatalogFailure: 'subject catalog response failed validation',
        },
      },
      'completed',
    );

    expect(completed?.subjectCatalogFailure).toBe(
      'subject catalog response failed validation',
    );
  });

  it('leaves the failure reason null when no payload recorded one', () => {
    const debug = visualDebugFor(completedVisualPayload, 'completed');

    expect(debug?.subjectCatalogFailure).toBeNull();
  });

  it('counts how many scenes share one mirrored image', () => {
    const debug = visualDebugFor(
      {
        imageSearch: episodeImageSearch,
        assets: [
          { assetId: 'image-01', r2Url: 'https://cdn.example.com/one.jpg' },
          { assetId: 'image-02', r2Url: 'https://cdn.example.com/two.jpg' },
        ],
        visualPlan: {
          scenes: [
            {
              sceneId: 'scene-01',
              asset: { url: 'https://cdn.example.com/one.jpg' },
            },
            {
              sceneId: 'scene-02',
              asset: { url: 'https://cdn.example.com/one.jpg' },
            },
            {
              sceneId: 'scene-03',
              asset: { url: 'https://cdn.example.com/two.jpg' },
            },
          ],
        },
      },
      'processing',
    );

    expect(debug?.reuse).toEqual([{ assetId: 'image-01', useCount: 2 }]);
  });
});
