import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import {
  createPodcastVisualService,
  summarizeVisualPlan,
} from './podcast-visual.js';

const fakeClient = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('./supabase.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./supabase.js')>();
  return {
    ...actual,
    createConfiguredServiceRoleClient: () => fakeClient.current,
  };
});

const EPISODE_ID = '826f4b87-6278-4275-bff5-535ba5ef438d';

type QueryResult = { data: unknown; error: unknown };

function chain(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit', 'in']) {
    builder[method] = () => builder;
  }
  builder['maybeSingle'] = () => Promise.resolve(result);
  builder['then'] = (
    onFulfilled: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function ok(data: unknown): QueryResult {
  return { data, error: null };
}

function client(
  tables: Record<string, QueryResult | QueryResult[]>,
  rpc: ReturnType<typeof vi.fn> = vi.fn(),
) {
  const queues = new Map(
    Object.entries(tables).map(([table, results]) => [
      table,
      Array.isArray(results) ? [...results] : [results],
    ]),
  );
  return {
    from: vi.fn((table: string) => {
      const queue = queues.get(table);
      const next = queue?.shift();
      if (!next) {
        throw new Error(`unexpected read of ${table}`);
      }
      return chain(next);
    }),
    rpc,
  };
}

function service(fake: unknown) {
  fakeClient.current = fake;
  return createPodcastVisualService({
    config: readControlCenterConfig({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    }),
  });
}

function happyTables(
  overrides: Record<string, QueryResult | QueryResult[]> = {},
) {
  return {
    episodes: ok({
      id: EPISODE_ID,
      source_title: 'Title',
      source_url: 'https://example.com/article',
    }),
    episode_video_visuals: [
      ok({
        episode_id: EPISODE_ID,
        status: 'completed',
        visual_version: 'v9',
        visual_hash: 'a'.repeat(64),
        attempt_count: 1,
        last_error: null,
        visual_payload: {
          visualPlan: { scenes: [{ sceneId: 'scene-01' }] },
        },
      }),
      ok({ last_failure_diagnostics: null }),
    ],
    episode_video_reviews: ok([]),
    ...overrides,
  };
}

describe('podcast visual coverage gaps', () => {
  it('nulls diagnostics when the diagnostics row carries nothing', async () => {
    const response = await service(
      client(happyTables({ episode_video_visuals: [ok(null), ok(null)] })),
    ).getVisualDebug(EPISODE_ID);

    expect(response.status).toBe('ok');
    expect(response.failure).toBeNull();
  });

  it('reports an unknown visual status when the row omits it', async () => {
    const response = await service(
      client(
        happyTables({
          episode_video_visuals: [
            ok({
              episode_id: EPISODE_ID,
              status: '   ',
              visual_version: null,
              visual_hash: null,
              attempt_count: null,
              last_error: null,
              visual_payload: null,
            }),
            ok({ last_failure_diagnostics: null }),
          ],
        }),
      ),
    ).getVisualDebug(EPISODE_ID);

    expect(response.status).toBe('ok');
    expect(response.visual).toMatchObject({ status: 'unknown' });
  });

  it('treats a null review payload as no reviews', async () => {
    const response = await service(
      client(happyTables({ episode_video_reviews: ok(null) })),
    ).getVisualDebug(EPISODE_ID);

    expect(response.status).toBe('ok');
    expect(response.reviews).toEqual([]);
  });

  it('drops sentence rows without a scene id', () => {
    const scenes = summarizeVisualPlan({
      visualPlan: { scenes: [{ sceneId: 'scene-01' }] },
      provenance: {
        sceneSentences: [
          { text: 'orphan without a scene' },
          { sceneId: 'scene-01', text: 'kept' },
        ],
      },
    });

    expect(scenes).toHaveLength(1);
    expect(scenes[0]?.sentenceText).toBe('kept');
  });

  it('defaults trace provider and query when the row omits them', () => {
    const scenes = summarizeVisualPlan({
      visualPlan: { scenes: [{ sceneId: 'scene-01' }] },
      provenance: { searchTrace: [{ sceneId: 'scene-01' }] },
    });

    expect(scenes[0]?.trace).toEqual([
      {
        provider: 'unknown',
        query: '',
        returned: 0,
        accepted: 0,
        entityFiltered: 0,
        rejected: 0,
      },
    ]);
  });

  it('ignores subject rows without both a key and a label', () => {
    const scenes = summarizeVisualPlan({
      visualPlan: { scenes: [{ sceneId: 'scene-01' }] },
      provenance: {
        imageSearch: {
          primarySubjects: [{ subjectKey: 'a16z' }],
          requests: [{ subjectLabel: 'orphan' }],
          scenes: [
            {
              sceneId: 'scene-01',
              selection: 'pool',
              matchedSubjectKey: 'a16z',
              sourceQuery: 'q',
              providerRank: 1,
              fallbackReason: null,
            },
          ],
        },
      },
    });

    expect(scenes[0]?.selection).toMatchObject({
      selection: 'pool',
      matchedSubject: 'a16z',
    });
  });

  it('skips image-search scenes without a scene id or selection', () => {
    const scenes = summarizeVisualPlan({
      visualPlan: { scenes: [{ sceneId: 'scene-01' }] },
      provenance: {
        imageSearch: {
          primarySubjects: [{ subjectKey: 'a', subjectLabel: 'A' }],
          requests: [],
          scenes: [
            { selection: 'pool' },
            { sceneId: 'scene-01' },
            {
              sceneId: 'scene-01',
              selection: 'pool',
              matchedSubjectKey: null,
              sourceQuery: null,
              providerRank: null,
              fallbackReason: null,
            },
          ],
        },
      },
    });

    expect(scenes[0]?.selection).toMatchObject({
      selection: 'pool',
      matchedSubject: null,
    });
  });

  it('throws when the review mutation returns a non-object payload', async () => {
    const svc = service(
      client({}, vi.fn().mockResolvedValue({ data: null, error: null })),
    );

    await expect(
      svc.upsertReview(EPISODE_ID, { verdict: 'good', issueCategories: [] }),
    ).rejects.toThrow('Review mutation returned no row');
  });
});
