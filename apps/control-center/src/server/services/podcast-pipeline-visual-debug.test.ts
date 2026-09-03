import { describe, expect, it } from 'vitest';

import { summarizePodcastPipeline } from './podcast-pipeline.js';

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
    const localizations = ['zh-Hant', 'ja', 'en'].map((language_code, index) => ({
      id: `loc-${index}`,
      episode_id: 'episode-1',
      language_code,
      status: 'completed',
      script: 'ready',
      hls_url: 'https://example.com/audio.m3u8',
      classroom_hls_url:
        language_code === 'zh-Hant' ? 'https://example.com/classroom.m3u8' : null,
      updated_at: '2026-09-03T00:10:00.000Z',
    }));
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

  it('surfaces the exact provider queries used by a completed visual job', () => {
    const now = new Date('2026-09-03T01:00:00.000Z');
    const [episode] = summarizePodcastPipeline(
      [
        {
          id: 'episode-2',
          source_title: 'a16z AI writing guide',
          source_url: 'https://example.com/a16z-complete',
          created_at: '2026-09-03T00:00:00.000Z',
        },
      ] as never,
      [],
      [],
      [
        {
          episode_id: 'episode-2',
          status: 'completed',
          progress_percent: 100,
          progress_stage: 'completed',
          attempt_count: 1,
          lease_expires_at: null,
          last_error: null,
          updated_at: '2026-09-03T00:20:00.000Z',
          visual_payload: {
            subjectCatalog: {
              primarySubjectId: 'subject-a16z',
              subjects: [{ id: 'subject-a16z', canonicalName: 'a16z' }],
            },
            storyboard: {
              scenes: [
                {
                  sceneId: 'scene-01',
                  imageSearchIntent: ['a16z AI writing', 'a16z'],
                },
              ],
            },
            searchTrace: [
              {
                sceneId: 'scene-01',
                provider: 'pexels',
                intent: 'a16z AI writing',
                returned: 12,
                accepted: 0,
                entityFiltered: 12,
                rejected: 0,
              },
              {
                sceneId: 'scene-01',
                provider: 'brave',
                intent: 'a16z',
                returned: 20,
                accepted: 4,
                entityFiltered: 2,
                rejected: 1,
              },
            ],
          },
        },
      ] as never,
      [],
      now,
    );

    expect(episode?.visualDebug?.actualSearches).toEqual([
      {
        sceneId: 'scene-01',
        provider: 'pexels',
        query: 'a16z AI writing',
        returned: 12,
        accepted: 0,
        entityFiltered: 12,
        rejected: 0,
      },
      {
        sceneId: 'scene-01',
        provider: 'brave',
        query: 'a16z',
        returned: 20,
        accepted: 4,
        entityFiltered: 2,
        rejected: 1,
      },
    ]);
  });
});
