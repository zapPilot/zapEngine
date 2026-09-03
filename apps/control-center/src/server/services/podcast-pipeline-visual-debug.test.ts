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
            subjects: [
              { id: 'subject-a16z', canonicalName: 'a16z' },
            ],
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
    });
  });
});
