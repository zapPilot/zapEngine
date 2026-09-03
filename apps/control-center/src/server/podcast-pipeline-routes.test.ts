import { describe, expect, it, vi } from 'vitest';

import { createControlCenterApp } from './app.js';
import { readControlCenterConfig } from './config/env.js';

const EPISODE_ID = '826f4b87-6278-4275-bff5-535ba5ef438d';
const LOCALIZATION_ID = '00000000-0000-4000-8000-000000000001';
const REVIEW_ID = 'b1c2d3e4-0000-4000-8000-000000000001';
const MISSING_RPC = { code: 'PGRST202', message: 'function not found' };

type Fake = ReturnType<typeof vi.fn>;

function createApp(
  pipeline: {
    getPipeline: Fake;
    restartIngest: Fake;
    restartVideo: Fake;
    restartRender?: Fake;
  },
  podcastVisual: {
    getVisualDebug?: Fake;
    upsertReview?: Fake;
    resolveReview?: Fake;
  } = {},
) {
  return createControlCenterApp({
    config: readControlCenterConfig({}),
    podcastPipeline: pipeline as never,
    podcastVisual: podcastVisual as never,
    service: {
      getOverview: vi.fn(),
      getCostHistory: vi.fn(),
      syncCosts: vi.fn(),
      getSocial: vi.fn(),
    } as never,
    operations: {
      getOperations: vi.fn(),
      getSocial: vi.fn(),
      getCustomers: vi.fn(),
      inspectSignal: vi.fn(),
      resolveSentryIssue: vi.fn(),
      investigate: vi.fn(),
    } as never,
    socialGrowth: { getSocialGrowth: vi.fn() } as never,
    serveClient: false,
  });
}

function retryRequest(
  app: ReturnType<typeof createApp>,
  episodeId = EPISODE_ID,
  stage: 'ingest' | 'video' = 'video',
) {
  return app.request(`/api/podcast-pipeline/${episodeId}/${stage}/retry`, {
    method: 'POST',
  });
}

function retryApp(rejection?: unknown) {
  const restartIngest = vi.fn();
  const restartVideo = vi.fn();
  const restartRender = vi.fn();
  for (const restart of [restartIngest, restartVideo, restartRender]) {
    if (rejection === undefined) {
      restart.mockResolvedValue(undefined);
    } else {
      restart.mockRejectedValue(rejection);
    }
  }
  return {
    app: createApp({
      getPipeline: vi.fn(),
      restartIngest,
      restartVideo,
      restartRender,
    }),
    restartIngest,
    restartVideo,
    restartRender,
  };
}

function visualApp(podcastVisual: Parameters<typeof createApp>[1]) {
  return createApp(
    {
      getPipeline: vi.fn(),
      restartIngest: vi.fn(),
      restartVideo: vi.fn(),
    },
    podcastVisual,
  );
}

function jsonRequest(
  app: ReturnType<typeof createApp>,
  path: string,
  method: 'PUT' | 'POST',
  body: unknown,
) {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function putReview(
  app: ReturnType<typeof createApp>,
  body: unknown,
  episodeId = EPISODE_ID,
) {
  return jsonRequest(
    app,
    `/api/podcast-pipeline/${episodeId}/reviews`,
    'PUT',
    body,
  );
}

function resolveReview(
  app: ReturnType<typeof createApp>,
  body: unknown,
  reviewId = REVIEW_ID,
) {
  return jsonRequest(
    app,
    `/api/podcast-pipeline/reviews/${reviewId}/resolve`,
    'POST',
    body,
  );
}

function retryRender(
  app: ReturnType<typeof createApp>,
  localizationId = LOCALIZATION_ID,
) {
  return app.request(
    `/api/podcast-pipeline/${EPISODE_ID}/renders/${localizationId}/retry`,
    { method: 'POST' },
  );
}

const validReview = {
  verdict: 'bad',
  issueCategories: ['wrong-subject', 'text-heavy'],
  sceneId: 'scene-01',
  languageCode: 'ja',
  visualHash: 'a'.repeat(64),
  note: '  Wrong person  ',
  pipelineContext: { assetId: 'image-01' },
};

const mappedReview = {
  id: REVIEW_ID,
  episodeId: EPISODE_ID,
  verdict: 'bad',
  status: 'open',
};

async function videoRetryWith(body: unknown) {
  const { app, restartVideo } = retryApp();
  const response = await jsonRequest(
    app,
    `/api/podcast-pipeline/${EPISODE_ID}/video/retry`,
    'POST',
    body,
  );
  return { restartVideo, response };
}

describe('podcast pipeline routes', () => {
  it('serves the current production phase read model', async () => {
    const getPipeline = vi.fn().mockResolvedValue({
      generatedAt: '2026-09-01T00:00:00.000Z',
      status: 'ok',
      message: null,
      episodes: [{ episodeId: 'episode-1', currentPhase: 'video' }],
    });
    const app = createApp({
      getPipeline,
      restartIngest: vi.fn(),
      restartVideo: vi.fn(),
    });

    const response = await app.request('/api/podcast-pipeline');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      episodes: [{ currentPhase: 'video' }],
    });
    expect(getPipeline).toHaveBeenCalledOnce();
  });

  it('restarts ingest only through the explicit episode ingest endpoint', async () => {
    const { app, restartIngest } = retryApp();

    const response = await retryRequest(app, EPISODE_ID, 'ingest');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(restartIngest).toHaveBeenCalledWith(EPISODE_ID);
  });

  it('restarts video only through the explicit episode video endpoint', async () => {
    const { app, restartVideo } = retryApp();

    const response = await retryRequest(app);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(restartVideo).toHaveBeenCalledWith(EPISODE_ID, {
      forceReplan: false,
    });
  });

  it.each([
    ['55000', 'worker already owns this lease'],
    ['22023', 'audio prerequisites are incomplete'],
    ['23514', 'completed visual checkpoint is invalid'],
  ])('maps stable postgres code %s to a conflict', async (code, message) => {
    const { app, restartVideo } = retryApp({ code, message });

    const response = await retryRequest(app);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: message });
    expect(restartVideo).toHaveBeenCalledOnce();
  });

  it('maps an active ingest lease to a conflict', async () => {
    const { app, restartIngest } = retryApp({
      code: '55000',
      message: 'Episode ingest is currently processing',
    });

    const response = await retryRequest(app, EPISODE_ID, 'ingest');

    expect(response.status).toBe(409);
    expect(restartIngest).toHaveBeenCalledOnce();
  });

  it('keeps message matching as a compatibility fallback', async () => {
    const { app } = retryApp(
      new Error('Episode video generation is already completed'),
    );

    expect((await retryRequest(app)).status).toBe(409);
  });

  it('returns 503 for an unexpected retry failure', async () => {
    const { app } = retryApp(new Error('database offline'));

    const response = await retryRequest(app);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'database offline',
    });
  });

  it('rejects malformed episode ids before touching the database', async () => {
    const { app, restartVideo } = retryApp();

    const response = await retryRequest(app, 'not-a-uuid');

    expect(response.status).toBe(400);
    expect(restartVideo).not.toHaveBeenCalled();
  });

  it('returns 503 when the ingest retry RPC is not deployed yet', async () => {
    const { app } = retryApp(MISSING_RPC);

    const response = await retryRequest(app, EPISODE_ID, 'ingest');

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Podcast pipeline database migration has not been applied yet',
    });
  });

  it('forwards an explicit forceReplan flag to the video restart', async () => {
    const { restartVideo, response } = await videoRetryWith({
      forceReplan: true,
    });

    expect(response.status).toBe(200);
    expect(restartVideo).toHaveBeenCalledWith(EPISODE_ID, {
      forceReplan: true,
    });
  });

  it('rejects a non-boolean forceReplan before touching the pipeline', async () => {
    const { restartVideo, response } = await videoRetryWith({
      forceReplan: 'yes',
    });

    expect(response.status).toBe(400);
    expect(restartVideo).not.toHaveBeenCalled();
  });

  it('treats a malformed JSON body as an ordinary retry', async () => {
    const { restartVideo, response } = await videoRetryWith('{not json');

    expect(response.status).toBe(200);
    expect(restartVideo).toHaveBeenCalledWith(EPISODE_ID, {
      forceReplan: false,
    });
  });

  describe('per-language render retry', () => {
    it('retries one localization render', async () => {
      const { app, restartRender } = retryApp();

      const response = await retryRender(app);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(restartRender).toHaveBeenCalledWith(EPISODE_ID, LOCALIZATION_ID);
    });

    it('rejects a malformed localization id', async () => {
      const { app, restartRender } = retryApp();

      const response = await retryRender(app, 'not-a-uuid');

      expect(response.status).toBe(400);
      expect(restartRender).not.toHaveBeenCalled();
    });

    it('maps a live lease to a conflict', async () => {
      const { app } = retryApp({
        code: '55000',
        message: 'render is processing',
      });

      const response = await retryRender(app);

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: 'render is processing',
      });
    });

    it('returns 503 when the render retry RPC is missing', async () => {
      const { app } = retryApp(MISSING_RPC);

      expect((await retryRender(app)).status).toBe(503);
    });
  });

  describe('visual debug', () => {
    it('rejects a malformed episode id', async () => {
      const getVisualDebug = vi.fn();
      const app = visualApp({ getVisualDebug });

      const response = await app.request(
        '/api/podcast-pipeline/not-a-uuid/visual',
      );

      expect(response.status).toBe(400);
      expect(getVisualDebug).not.toHaveBeenCalled();
    });

    it('returns 404 with the read model when the episode is unknown', async () => {
      const app = visualApp({
        getVisualDebug: vi.fn().mockResolvedValue({
          status: 'not-found',
          message: 'Episode not found',
        }),
      });

      const response = await app.request(
        `/api/podcast-pipeline/${EPISODE_ID}/visual`,
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        status: 'not-found',
      });
    });

    it('serves the visual debug read model', async () => {
      const getVisualDebug = vi.fn().mockResolvedValue({
        status: 'ok',
        scenes: [{ sceneId: 'scene-01' }],
      });
      const app = visualApp({ getVisualDebug });

      const response = await app.request(
        `/api/podcast-pipeline/${EPISODE_ID}/visual`,
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        status: 'ok',
        scenes: [{ sceneId: 'scene-01' }],
      });
      expect(getVisualDebug).toHaveBeenCalledWith(EPISODE_ID);
    });
  });

  describe('review upsert', () => {
    it('trims and forwards a valid review and returns the mapped row', async () => {
      const upsertReview = vi.fn().mockResolvedValue(mappedReview);
      const app = visualApp({ upsertReview });

      const response = await putReview(app, validReview);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(mappedReview);
      expect(upsertReview).toHaveBeenCalledWith(EPISODE_ID, {
        verdict: 'bad',
        issueCategories: ['wrong-subject', 'text-heavy'],
        sceneId: 'scene-01',
        languageCode: 'ja',
        visualHash: 'a'.repeat(64),
        note: 'Wrong person',
        pipelineContext: { assetId: 'image-01' },
      });
    });

    it('defaults the optional fields when the body omits them', async () => {
      const upsertReview = vi.fn().mockResolvedValue(mappedReview);
      const app = visualApp({ upsertReview });

      const response = await putReview(app, {
        verdict: 'good',
        issueCategories: [],
      });

      expect(response.status).toBe(200);
      expect(upsertReview).toHaveBeenCalledWith(EPISODE_ID, {
        verdict: 'good',
        issueCategories: [],
        sceneId: null,
        languageCode: null,
        visualHash: null,
        note: null,
        pipelineContext: {},
      });
    });

    it('rejects a malformed episode id', async () => {
      const upsertReview = vi.fn();
      const app = visualApp({ upsertReview });

      const response = await putReview(app, validReview, 'not-a-uuid');

      expect(response.status).toBe(400);
      expect(upsertReview).not.toHaveBeenCalled();
    });

    it.each([
      ['array body', [validReview], 'Review body must be an object'],
      ['malformed JSON', '{not json', 'Review body must be an object'],
      [
        'unknown verdict',
        { ...validReview, verdict: 'meh' },
        'Invalid review verdict',
      ],
      [
        'unknown issue category',
        { ...validReview, issueCategories: ['wrong-subject', 'boring'] },
        'Invalid review issue categories',
      ],
      [
        'non-array issue categories',
        { ...validReview, issueCategories: 'wrong-subject' },
        'Invalid review issue categories',
      ],
      ['scene id', { ...validReview, sceneId: 'scene-1' }, 'Invalid scene id'],
      [
        'language',
        { ...validReview, languageCode: 'fr' },
        'Invalid review language',
      ],
      [
        'oversized note',
        { ...validReview, note: 'x'.repeat(2001) },
        'Review note exceeds 2000 characters',
      ],
      [
        'array pipeline context',
        { ...validReview, pipelineContext: [] },
        'Invalid review pipeline context',
      ],
      [
        'oversized pipeline context',
        { ...validReview, pipelineContext: { blob: 'x'.repeat(8192) } },
        'Invalid review pipeline context',
      ],
    ])('rejects %s with 400', async (_label, body, error) => {
      const upsertReview = vi.fn();
      const app = visualApp({ upsertReview });

      const response = await putReview(app, body);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error });
      expect(upsertReview).not.toHaveBeenCalled();
    });

    it.each(['22023', '23514'])(
      'maps a database rejection %s to a conflict',
      async (code) => {
        const app = visualApp({
          upsertReview: vi
            .fn()
            .mockRejectedValue({ code, message: 'review rejected' }),
        });

        const response = await putReview(app, validReview);

        expect(response.status).toBe(409);
        await expect(response.json()).resolves.toEqual({
          error: 'review rejected',
        });
      },
    );

    it.each(['PGRST202', '42883'])(
      'returns 503 when the review RPC is missing (%s)',
      async (code) => {
        const app = visualApp({
          upsertReview: vi
            .fn()
            .mockRejectedValue({ code, message: 'no function' }),
        });

        const response = await putReview(app, validReview);

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toEqual({
          error: 'Podcast review migration has not been applied yet',
        });
      },
    );
  });

  describe('review resolution', () => {
    it('resolves a review', async () => {
      const resolve = vi.fn().mockResolvedValue(true);
      const app = visualApp({ resolveReview: resolve });

      const response = await resolveReview(app, {
        status: 'resolved',
        resolutionNote: 'Verified',
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(resolve).toHaveBeenCalledWith(REVIEW_ID, {
        status: 'resolved',
        resolutionNote: 'Verified',
      });
    });

    it('returns 404 when no review changed', async () => {
      const app = visualApp({
        resolveReview: vi.fn().mockResolvedValue(false),
      });

      const response = await resolveReview(app, { status: 'triaged' });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: 'Review not found',
      });
    });

    it('rejects a malformed review id', async () => {
      const resolve = vi.fn();
      const app = visualApp({ resolveReview: resolve });

      const response = await resolveReview(app, { status: 'resolved' }, 'nope');

      expect(response.status).toBe(400);
      expect(resolve).not.toHaveBeenCalled();
    });

    it.each([
      [
        'unknown status',
        { status: 'closed' },
        'Review status must be triaged or resolved',
      ],
      ['array body', [], 'Review resolution body must be an object'],
      [
        'oversized resolution note',
        { status: 'resolved', resolutionNote: 'x'.repeat(2001) },
        'Resolution note exceeds 2000 characters',
      ],
    ])('rejects %s with 400', async (_label, body, error) => {
      const resolve = vi.fn();
      const app = visualApp({ resolveReview: resolve });

      const response = await resolveReview(app, body);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error });
      expect(resolve).not.toHaveBeenCalled();
    });

    it('returns 503 when the resolve RPC is missing', async () => {
      const app = visualApp({
        resolveReview: vi.fn().mockRejectedValue(MISSING_RPC),
      });

      expect((await resolveReview(app, { status: 'resolved' })).status).toBe(
        503,
      );
    });
  });
});
