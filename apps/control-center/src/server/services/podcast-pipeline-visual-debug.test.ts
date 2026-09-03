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

// One view row per stored trace entry, in order, with the provider intent read
// as the query and the catalog `subjectKey` dropped.
function searchRowFor(
  trace: (typeof completedVisualPayload)['provenance']['searchTrace'][number],
): PodcastPipelineVisualDebug['actualSearches'][number] {
  return {
    sceneId: trace.sceneId,
    provider: trace.provider,
    query: trace.intent,
    returned: trace.returned,
    accepted: trace.accepted,
    entityFiltered: trace.entityFiltered,
    rejected: trace.rejected,
  };
}

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
      plannedQueries: [
        {
          sceneId: 'scene-01',
          subjectIds: ['subject-a16z'],
          selectionReason: 'direct',
          queries: ['a16z'],
        },
      ],
      actualSearches: [],
    });
  });

  it('reads a completed payload from provenance.searchTrace and visualPlan.scenes', () => {
    const debug = visualDebugFor(completedVisualPayload, 'completed');

    expect(debug?.actualSearches).toEqual(
      completedVisualPayload.provenance.searchTrace.map(searchRowFor),
    );
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
        query: 'a16z AI writing',
        returned: 8,
        accepted: 0,
        entityFiltered: 8,
        rejected: 0,
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
});
