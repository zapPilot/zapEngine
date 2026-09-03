import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import {
  createPodcastVisualService,
  mapReviewRow,
  summarizeVisualFailure,
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
const LOCALIZATION_ID = '00000000-0000-4000-8000-000000000001';
const IMAGE_URL = 'https://cdn.example.com/visual/image-01.jpg';
const SLIDE_URL = 'https://cdn.example.com/visual/slide-02.png';

type QueryResult = { data: unknown; error: unknown };

/** Every PostgREST builder method returns the same chain; awaiting the chain
 * (or `maybeSingle()`) resolves the queued result for that table. */
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

/** supabase-js `PostgrestError` extends `Error`, so the fake must too for the
 * service to surface its message. */
function failing(code: string, message = `error ${code}`): QueryResult {
  return { data: null, error: Object.assign(new Error(message), { code }) };
}

/** `tables` values are consumed in order, so a table read twice (visuals base
 * row, then its diagnostics column) lists both results. */
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

const reviewRow = {
  id: 'b1c2d3e4-0000-4000-8000-000000000001',
  episode_id: EPISODE_ID,
  visual_hash: 'a'.repeat(64),
  language_code: null,
  scene_id: 'scene-01',
  reviewer: 'operator',
  verdict: 'bad',
  issue_categories: ['wrong-subject'],
  note: 'Wrong person',
  pipeline_context: { assetId: 'image-01' },
  status: 'open',
  resolution_note: null,
  resolved_by: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
};

const visualRow = {
  episode_id: EPISODE_ID,
  status: 'completed',
  visual_version: 'podcast-image-visual-plan.v9',
  visual_hash: 'a'.repeat(64),
  attempt_count: 2,
  last_error: null,
  visual_payload: v9Payload(),
};

function happyTables(
  overrides: Record<string, QueryResult | QueryResult[]> = {},
) {
  return {
    episodes: ok({
      id: EPISODE_ID,
      source_title: 'From bananas to AI',
      source_url: 'https://example.com/article',
    }),
    episode_video_visuals: [
      ok(visualRow),
      ok({
        last_failure_diagnostics: {
          stage: 'render',
          message: 'ffmpeg exited 1',
          failedAt: '2026-09-01T00:00:00.000Z',
          attempt: 2,
        },
      }),
    ],
    episode_localizations: ok([{ id: LOCALIZATION_ID, language_code: 'ja' }]),
    episode_videos: ok([
      {
        episode_localization_id: LOCALIZATION_ID,
        status: 'completed',
        mp4_url: 'https://cdn.example.com/ja.mp4',
        thumbnail_url: 'https://cdn.example.com/ja.jpg',
        duration_seconds: 61,
      },
      {
        episode_localization_id: 'unknown-localization',
        status: 'queued',
        mp4_url: null,
        thumbnail_url: null,
        duration_seconds: null,
      },
    ]),
    episode_video_reviews: ok([reviewRow]),
    ...overrides,
  };
}

function v9Payload(): Record<string, unknown> {
  return {
    schemaVersion: 'podcast-episode-visual.v1',
    visualVersion: 'podcast-image-visual-plan.v9',
    visualPlan: {
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: ['a16z AI writing', 'a16z'],
          imageSearchEntities: ['a16z'],
          asset: { kind: 'remoteImage', url: IMAGE_URL },
        },
        {
          sceneId: 'scene-02',
          imageSearchIntent: [],
          asset: { kind: 'remoteImage', url: SLIDE_URL },
        },
        {
          sceneId: 'scene-03',
          imageSearchIntent: ['brand:zap-pilot-outro'],
          asset: {
            kind: 'remoteImage',
            url: 'https://cdn.example.com/none.png',
          },
        },
        { imageSearchIntent: ['no scene id'] },
      ],
    },
    sceneAssignments: [
      {
        sceneId: 'scene-01',
        subjectIds: ['subject-a16z'],
        selectionReason: 'direct',
      },
      { subjectIds: ['dropped-without-scene-id'] },
    ],
    assets: [
      {
        assetId: 'image-01',
        r2Url: IMAGE_URL,
        provider: 'brave',
        license: 'publisher',
        sourcePageUrl: 'https://a16z.com/post',
        width: 1280,
        height: 720,
      },
      {
        assetId: 'slide-02',
        r2Url: SLIDE_URL,
        provider: 'generated-slide',
        license: 'brand-generated',
        sourcePageUrl: null,
        width: 'not-a-number',
        height: 1280,
        slide: { headline: 'Three bets for 2027' },
      },
      { provider: 'no r2 url, ignored' },
    ],
    provenance: {
      sceneSentences: [
        { sceneId: 'scene-01', text: 'a16z bets on AI writing tools.' },
        { sceneId: 'scene-02' },
      ],
      searchTrace: [
        {
          sceneId: 'scene-01',
          provider: 'pexels',
          intent: 'a16z AI writing',
          returned: 20,
          accepted: 0,
          entityFiltered: 20,
          rejected: 0,
        },
        {
          sceneId: 'scene-01',
          provider: 'brave',
          intent: 'a16z',
          returned: 12,
          accepted: 3,
          entityFiltered: 4,
          rejected: 5,
        },
        { provider: 'brave', intent: 'dropped without scene id' },
      ],
    },
  };
}

function rpcFailingService(rpcError: { code: string; message: string }) {
  return service(
    client({}, vi.fn().mockResolvedValue({ data: null, error: rpcError })),
  );
}

describe('summarizeVisualPlan', () => {
  it('joins a v9 payload into per-scene sentence, assignment, asset and trace', () => {
    const scenes = summarizeVisualPlan(v9Payload());

    expect(scenes.map(({ sceneId }) => sceneId)).toEqual([
      'scene-01',
      'scene-02',
      'scene-03',
    ]);
    expect(scenes[0]).toEqual({
      sceneId: 'scene-01',
      sentenceText: 'a16z bets on AI writing tools.',
      imageSearchIntent: ['a16z AI writing', 'a16z'],
      imageSearchEntities: ['a16z'],
      subjectIds: ['subject-a16z'],
      selectionReason: 'direct',
      asset: {
        assetId: 'image-01',
        url: IMAGE_URL,
        provider: 'brave',
        license: 'publisher',
        sourcePageUrl: 'https://a16z.com/post',
        width: 1280,
        height: 720,
        slideHeadline: null,
      },
      trace: [
        {
          provider: 'pexels',
          query: 'a16z AI writing',
          returned: 20,
          accepted: 0,
          entityFiltered: 20,
          rejected: 0,
        },
        {
          provider: 'brave',
          query: 'a16z',
          returned: 12,
          accepted: 3,
          entityFiltered: 4,
          rejected: 5,
        },
      ],
    });
    expect(scenes[1]).toMatchObject({
      sentenceText: null,
      subjectIds: [],
      selectionReason: null,
      asset: {
        assetId: 'slide-02',
        provider: 'generated-slide',
        width: null,
        height: 1280,
        slideHeadline: 'Three bets for 2027',
      },
      trace: [],
    });
    // An asset url the assets list does not know yields no asset at all.
    expect(scenes[2]).toMatchObject({ asset: null, trace: [] });
  });

  it('reads the trace from the top level and assignments from provenance when the plan is older', () => {
    const scenes = summarizeVisualPlan({
      visualPlan: {
        scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['a16z'] }],
      },
      searchTrace: [
        { sceneId: 'scene-01', provider: 'pixabay', intent: 'a16z' },
      ],
      provenance: {
        sceneAssignments: [{ sceneId: 'scene-01', subjectIds: ['s1'] }],
      },
    });

    expect(scenes).toEqual([
      {
        sceneId: 'scene-01',
        sentenceText: null,
        imageSearchIntent: ['a16z'],
        imageSearchEntities: [],
        subjectIds: ['s1'],
        selectionReason: null,
        asset: null,
        trace: [
          {
            provider: 'pixabay',
            query: 'a16z',
            returned: 0,
            accepted: 0,
            entityFiltered: 0,
            rejected: 0,
          },
        ],
      },
    ]);
  });

  it('keeps scenes from a legacy v1 payload with no provenance or assignments', () => {
    const scenes = summarizeVisualPlan({
      schemaVersion: 'podcast-image-visual-plan.v1',
      visualPlan: {
        scenes: [
          { sceneId: 'scene-01', imageSearchIntent: ['bananas'] },
          { sceneId: 'scene-02' },
        ],
      },
    });

    expect(scenes).toHaveLength(2);
    expect(scenes[0]).toMatchObject({
      sceneId: 'scene-01',
      sentenceText: null,
      imageSearchIntent: ['bananas'],
      asset: null,
      trace: [],
    });
    expect(scenes[1]).toMatchObject({
      sceneId: 'scene-02',
      imageSearchIntent: [],
    });
  });

  it.each([
    ['null', null],
    ['no plan', { visualVersion: 'x' }],
    ['scenes not an array', { visualPlan: { scenes: 'garbage' } }],
    ['scene rows not objects', { visualPlan: { scenes: [1, 'two', null] } }],
  ])('returns no scenes for %s', (_label, payload) => {
    expect(
      summarizeVisualPlan(payload as Record<string, unknown> | null),
    ).toEqual([]);
  });
});

describe('summarizeVisualFailure', () => {
  it('returns null without diagnostics', () => {
    expect(summarizeVisualFailure(null)).toBeNull();
  });

  it('extracts the stable fields and keeps the raw diagnostics', () => {
    const raw = {
      stage: 'render',
      message: 'ffmpeg exited 1',
      failedAt: '2026-09-01T00:00:00.000Z',
      attempt: 2,
      extra: { command: 'ffmpeg' },
    };
    expect(summarizeVisualFailure(raw)).toEqual({
      stage: 'render',
      message: 'ffmpeg exited 1',
      failedAt: '2026-09-01T00:00:00.000Z',
      attempt: 2,
      raw,
    });
  });

  it('nulls fields with the wrong type instead of guessing', () => {
    expect(
      summarizeVisualFailure({ stage: 3, attempt: '2', message: ' ' }),
    ).toEqual({
      stage: null,
      message: null,
      failedAt: null,
      attempt: null,
      raw: { stage: 3, attempt: '2', message: ' ' },
    });
  });
});

describe('mapReviewRow', () => {
  it('maps an operator review with camelCase keys', () => {
    expect(mapReviewRow(reviewRow)).toEqual({
      id: reviewRow.id,
      episodeId: EPISODE_ID,
      visualHash: 'a'.repeat(64),
      languageCode: null,
      sceneId: 'scene-01',
      reviewer: 'operator',
      verdict: 'bad',
      issueCategories: ['wrong-subject'],
      note: 'Wrong person',
      pipelineContext: { assetId: 'image-01' },
      status: 'open',
      resolutionNote: null,
      resolvedBy: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
  });

  it('keeps agent reviewers and normalizes unknown reviewers and resolvers', () => {
    expect(
      mapReviewRow({
        ...reviewRow,
        reviewer: 'agent',
        resolved_by: 'agent',
        status: 'resolved',
      }),
    ).toMatchObject({
      reviewer: 'agent',
      resolvedBy: 'agent',
      status: 'resolved',
    });
    expect(
      mapReviewRow({
        ...reviewRow,
        reviewer: 'someone-else',
        resolved_by: 'bot',
      }),
    ).toMatchObject({ reviewer: 'operator', resolvedBy: null });
    expect(
      mapReviewRow({ ...reviewRow, resolved_by: 'operator' }).resolvedBy,
    ).toBe('operator');
  });

  it('defaults a null pipeline context to an empty object', () => {
    expect(
      mapReviewRow({
        ...reviewRow,
        pipeline_context: null as unknown as Record<string, unknown>,
      }).pipelineContext,
    ).toEqual({});
  });
});

describe('createPodcastVisualService', () => {
  it('reports unconfigured without touching a client', async () => {
    fakeClient.current = null;
    const visual = createPodcastVisualService({
      config: readControlCenterConfig({}),
    });

    await expect(visual.getVisualDebug(EPISODE_ID)).resolves.toMatchObject({
      status: 'unconfigured',
      message: 'Supabase is not connected',
      episode: null,
      scenes: [],
      reviews: [],
    });
    await expect(
      visual.upsertReview(EPISODE_ID, { verdict: 'good', issueCategories: [] }),
    ).rejects.toThrow('Supabase is not connected');
    await expect(
      visual.resolveReview(reviewRow.id, { status: 'resolved' }),
    ).rejects.toThrow('Supabase is not connected');
  });

  it('reports not-found when the episode row is missing', async () => {
    const fake = client(happyTables({ episodes: ok(null) }));

    const response = await service(fake).getVisualDebug(EPISODE_ID);

    expect(response).toMatchObject({
      status: 'not-found',
      message: 'Episode not found',
    });
    // The diagnostics follow-up read never happens for a missing episode.
    expect(
      fake.from.mock.calls.filter(
        ([table]) => table === 'episode_video_visuals',
      ),
    ).toHaveLength(1);
  });

  it('assembles the debug read model on the happy path', async () => {
    const response = await service(client(happyTables())).getVisualDebug(
      EPISODE_ID,
    );

    expect(response.status).toBe('ok');
    expect(response.episode).toEqual({
      id: EPISODE_ID,
      title: 'From bananas to AI',
      sourceUrl: 'https://example.com/article',
    });
    expect(response.visual).toEqual({
      status: 'completed',
      visualVersion: 'podcast-image-visual-plan.v9',
      visualHash: 'a'.repeat(64),
      attempts: 2,
      lastError: null,
    });
    expect(response.renders).toEqual([
      {
        languageCode: 'ja',
        status: 'completed',
        mp4Url: 'https://cdn.example.com/ja.mp4',
        thumbnailUrl: 'https://cdn.example.com/ja.jpg',
        durationSeconds: 61,
      },
      {
        languageCode: 'unknown',
        status: 'queued',
        mp4Url: null,
        thumbnailUrl: null,
        durationSeconds: null,
      },
    ]);
    expect(response.scenes.map(({ sceneId }) => sceneId)).toEqual([
      'scene-01',
      'scene-02',
      'scene-03',
    ]);
    expect(response.failure).toMatchObject({
      stage: 'render',
      message: 'ffmpeg exited 1',
    });
    expect(response.reviews).toEqual([mapReviewRow(reviewRow)]);
    expect(response.rawPlan).toEqual(v9Payload());
  });

  it('returns a null visual and no scenes when the episode has no visual job yet', async () => {
    const fake = client(happyTables({ episode_video_visuals: ok(null) }));

    const response = await service(fake).getVisualDebug(EPISODE_ID);

    expect(response).toMatchObject({
      status: 'ok',
      visual: null,
      scenes: [],
      failure: null,
      rawPlan: null,
    });
  });

  it.each(['42P01', 'PGRST205'])(
    'treats a missing reviews table (%s) as no reviews',
    async (code) => {
      const response = await service(
        client(happyTables({ episode_video_reviews: failing(code) })),
      ).getVisualDebug(EPISODE_ID);

      expect(response.status).toBe('ok');
      expect(response.reviews).toEqual([]);
      expect(response.scenes).toHaveLength(3);
    },
  );

  it('tolerates a missing last_failure_diagnostics column', async () => {
    const response = await service(
      client(
        happyTables({
          episode_video_visuals: [ok(visualRow), failing('42703')],
        }),
      ),
    ).getVisualDebug(EPISODE_ID);

    expect(response.status).toBe('ok');
    expect(response.failure).toBeNull();
    expect(response.visual?.visualHash).toBe('a'.repeat(64));
  });

  it.each([
    [
      'episodes',
      { episodes: failing('XX000', 'episodes offline') },
      'episodes offline',
    ],
    [
      'visuals',
      { episode_video_visuals: failing('XX000', 'visuals offline') },
      'visuals offline',
    ],
    [
      'reviews',
      { episode_video_reviews: failing('42501', 'permission denied') },
      'permission denied',
    ],
    [
      'diagnostics',
      {
        episode_video_visuals: [
          ok(visualRow),
          failing('XX000', 'diagnostics offline'),
        ],
      },
      'diagnostics offline',
    ],
  ])(
    'surfaces any other %s error as status error',
    async (_label, overrides, message) => {
      const response = await service(
        client(happyTables(overrides)),
      ).getVisualDebug(EPISODE_ID);

      expect(response).toMatchObject({
        status: 'error',
        message,
        episode: null,
      });
    },
  );

  it('upserts as the operator and maps an array RPC result', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [reviewRow], error: null });

    const review = await service(client({}, rpc)).upsertReview(EPISODE_ID, {
      verdict: 'bad',
      issueCategories: ['wrong-subject'],
      sceneId: 'scene-01',
      visualHash: 'a'.repeat(64),
      note: 'Wrong person',
      pipelineContext: { assetId: 'image-01' },
    });

    expect(rpc).toHaveBeenCalledWith('upsert_episode_video_review', {
      p_episode_id: EPISODE_ID,
      p_visual_hash: 'a'.repeat(64),
      p_language_code: null,
      p_scene_id: 'scene-01',
      p_reviewer: 'operator',
      p_verdict: 'bad',
      p_issue_categories: ['wrong-subject'],
      p_note: 'Wrong person',
      p_pipeline_context: { assetId: 'image-01' },
    });
    expect(review).toEqual(mapReviewRow(reviewRow));
  });

  it('maps an object RPC result and defaults optional review fields', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ...reviewRow, scene_id: null, language_code: 'ja' },
      error: null,
    });

    const review = await service(client({}, rpc)).upsertReview(EPISODE_ID, {
      verdict: 'good',
      issueCategories: [],
      languageCode: 'ja',
    });

    expect(rpc).toHaveBeenCalledWith(
      'upsert_episode_video_review',
      expect.objectContaining({
        p_language_code: 'ja',
        p_scene_id: null,
        p_visual_hash: null,
        p_note: null,
        p_pipeline_context: {},
      }),
    );
    expect(review).toMatchObject({ sceneId: null, languageCode: 'ja' });
  });

  it('throws when the upsert returns no row or an error', async () => {
    const empty = service(
      client({}, vi.fn().mockResolvedValue({ data: [], error: null })),
    );
    await expect(
      empty.upsertReview(EPISODE_ID, { verdict: 'good', issueCategories: [] }),
    ).rejects.toThrow('Review mutation returned no row');

    const rpcError = { code: 'PGRST202', message: 'function not found' };
    await expect(
      rpcFailingService(rpcError).upsertReview(EPISODE_ID, {
        verdict: 'good',
        issueCategories: [],
      }),
    ).rejects.toBe(rpcError);
  });

  it('resolves a review as the operator and reports whether a row changed', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });

    await expect(
      service(client({}, rpc)).resolveReview(reviewRow.id, {
        status: 'triaged',
        resolutionNote: 'Looking',
      }),
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('resolve_episode_video_review', {
      p_review_id: reviewRow.id,
      p_status: 'triaged',
      p_resolution_note: 'Looking',
      p_resolved_by: 'operator',
    });

    const unchanged = service(
      client({}, vi.fn().mockResolvedValue({ data: false, error: null })),
    );
    await expect(
      unchanged.resolveReview(reviewRow.id, { status: 'resolved' }),
    ).resolves.toBe(false);

    const rpcError = { code: '42883', message: 'no function' };
    await expect(
      rpcFailingService(rpcError).resolveReview(reviewRow.id, {
        status: 'resolved',
      }),
    ).rejects.toBe(rpcError);
  });
});
