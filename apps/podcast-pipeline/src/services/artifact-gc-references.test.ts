import { describe, expect, it } from 'vitest';

import { readArtifactReferenceState } from './artifact-gc.js';
import type { PipelineSupabaseClient } from './supabase-client.js';

describe('authoritative GC reference reads', () => {
  it('reads beyond server page caps and protects non-completed and cross-prefix references', async () => {
    const current = 'episodes/ep/localizations/en/video/v9/current';
    const prior = 'episodes/ep/localizations/en/video/v8/prior';
    const visual = 'episodes/ep/visuals/v9/current';
    const rows: Record<string, Record<string, unknown>[]> = {
      episode_videos: [
        {
          episode_localization_id: 'a',
          r2_prefix: current,
          status: 'failed',
          thumbnail_url: `https://cdn.test/${prior}/thumbnail.png`,
        },
        {
          episode_localization_id: 'b',
          r2_prefix: 'episodes/ep/localizations/ja/video/v9/current/',
        },
      ],
      episode_video_visuals: [
        {
          episode_id: 'ep',
          r2_prefix: visual,
          visual_payload: {
            image:
              'https://cdn.test/episodes/ep/visuals/v8/prior/images/image-01.jpg',
          },
        },
      ],
      artifact_retirements: [
        { r2_prefix: prior, unreferenced_at: '2026-08-01T00:00:00Z' },
      ],
    };
    const calls: string[] = [];
    const db = {
      from: (table: string) => {
        let key = '';
        let cursor = '';
        const query = {
          select: () => query,
          order: (value: string) => {
            key = value;
            return query;
          },
          limit: () => query,
          gt: (_key: string, value: string) => {
            cursor = value;
            return query;
          },
          then: (resolve: (value: unknown) => unknown) => {
            calls.push(table);
            return Promise.resolve(
              resolve({
                data: rows[table]!.filter(
                  (row) => String(row[key]) > cursor,
                ).slice(0, 1),
                error: null,
              }),
            );
          },
        };
        return query;
      },
    } as unknown as PipelineSupabaseClient;
    const state = await readArtifactReferenceState(db, 'https://cdn.test');
    expect([...state.references].sort()).toEqual(
      [
        current,
        prior,
        'episodes/ep/localizations/ja/video/v9/current',
        visual,
        'episodes/ep/visuals/v8/prior',
      ].sort(),
    );
    expect(state.retirements.get(prior)).toBe(
      Date.parse('2026-08-01T00:00:00Z'),
    );
    expect(calls.filter((table) => table === 'episode_videos')).toHaveLength(3);
  });
  it('does not treat a database error as zero current references', async () => {
    const query = {
      select: () => query,
      order: () => query,
      limit: () => Promise.resolve({ data: null, error: new Error('denied') }),
    };
    const db = { from: () => query } as unknown as PipelineSupabaseClient;
    await expect(
      readArtifactReferenceState(db, 'https://cdn.test'),
    ).rejects.toThrow('denied');
  });
});
