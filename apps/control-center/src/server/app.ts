import { serveStatic } from '@hono/node-server/serve-static';
import {
  PODCAST_VIDEO_REVIEW_ISSUES,
  PODCAST_VIDEO_REVIEW_VERDICTS,
} from '@zapengine/types/shared';
import { type Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { routePath } from 'hono/route';

import type {
  PodcastVideoReviewInput,
  PodcastVideoReviewResolveInput,
} from '../shared/podcast-visual.js';
import type { SocialPerformanceResponse } from '../shared/types.js';
import type { ControlCenterConfig } from './config/env.js';
import { registerOpsMcpHttp } from './mcp/http.js';
import { captureServerException } from './observability/sentry.js';
import { createOperationsService } from './services/operations/aggregate.js';
import { createOverviewService } from './services/overview.js';
import { createPipelineQueuesService } from './services/pipeline-queues.js';
import { createPodcastCostService } from './services/podcast-costs.js';
import { createPodcastPipelineService } from './services/podcast-pipeline.js';
import { createPodcastVisualService } from './services/podcast-visual.js';
import { createSocialReleaseCleanupService } from './services/social-release-cleanup.js';
import { isMissingRpcError } from './services/supabase.js';
import { createSocialGrowthService } from './services/social-growth.js';
import { createStatementsService } from './services/statements/index.js';

const WINDOWS: SocialPerformanceResponse['window'][] = [
  'latest',
  '24h',
  '72h',
  '7d',
];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createControlCenterApp(input: {
  config: ControlCenterConfig;
  service?: ReturnType<typeof createOverviewService>;
  operations?: ReturnType<typeof createOperationsService>;
  socialGrowth?: ReturnType<typeof createSocialGrowthService>;
  podcastPipeline?: ReturnType<typeof createPodcastPipelineService>;
  podcastVisual?: ReturnType<typeof createPodcastVisualService>;
  statements?: ReturnType<typeof createStatementsService>;
  serveClient?: boolean;
  /**
   * Local operator processes may explicitly refresh provider cost snapshots.
   * Remote dashboards stay read-only for cost collection by omitting this route.
   */
  allowCostSync?: boolean;
}) {
  const app = new Hono();
  const service =
    input.service ?? createOverviewService({ config: input.config });
  const podcastCosts = createPodcastCostService({ config: input.config });
  const podcastPipeline =
    input.podcastPipeline ??
    createPodcastPipelineService({ config: input.config });
  const pipelineQueues = createPipelineQueuesService({ config: input.config });
  const podcastVisual =
    input.podcastVisual ?? createPodcastVisualService({ config: input.config });
  // Injected separately from the overview service on purpose: the two share no
  // state, and folding operations into createOverviewService would force every
  // existing fake of it to grow methods its tests do not care about.
  const operations =
    input.operations ?? createOperationsService({ config: input.config });
  const socialGrowth =
    input.socialGrowth ?? createSocialGrowthService({ config: input.config });
  const socialReleaseCleanup = createSocialReleaseCleanupService({
    config: input.config,
  });
  const statements =
    input.statements ??
    createStatementsService({
      config: input.config,
      service,
      operations,
      socialGrowth,
      podcastPipeline,
      podcastCosts,
    });

  app.get('/api/overview', async (context) => {
    return context.json(await service.getOverview());
  });
  app.get('/api/costs/history', async (context) => {
    return context.json(await service.getCostHistory());
  });
  app.get('/api/costs/podcast', async (context) => {
    return context.json(await podcastCosts.getPodcastCosts());
  });
  if (input.allowCostSync !== false) {
    app.post('/api/costs/sync', async (context) => {
      try {
        const summary = await service.syncCosts();
        return context.json(summary);
      } catch (error) {
        captureServerException(error, {
          method: context.req.method,
          route: routePath(context),
        });
        return context.json(
          {
            error:
              error instanceof Error
                ? error.message
                : 'Cost synchronization failed',
          },
          503,
        );
      }
    });
  }
  app.get('/api/social-performance', async (context) => {
    const requested = context.req.query('window');
    const window = WINDOWS.includes(
      requested as SocialPerformanceResponse['window'],
    )
      ? (requested as SocialPerformanceResponse['window'])
      : 'latest';
    return context.json(await service.getSocial(window));
  });
  app.get('/api/social-growth', async (context) => {
    return context.json(await socialGrowth.getSocialGrowth(isForced(context)));
  });

  app.get('/api/operations', async (context) => {
    return context.json(await operations.getOperations(isForced(context)));
  });
  app.get('/api/operations/social', async (context) => {
    return context.json(await operations.getSocial(isForced(context)));
  });
  app.get('/api/operations/social/release-evidence', async (context) => {
    return context.json(await socialReleaseCleanup.getEvidence());
  });
  app.post('/api/operations/social/:episodeId/complete', async (context) => {
    const episodeIdOrResponse = episodeIdOrErrorResponse(context);
    if (typeof episodeIdOrResponse !== 'string') {
      return episodeIdOrResponse;
    }
    const episodeId = episodeIdOrResponse;
    try {
      return context.json(await socialReleaseCleanup.closeRelease(episodeId));
    } catch (error) {
      const message = errorMessage(error);
      if (isPodcastRetryConflict(error, message)) {
        return context.json({ error: message }, 409);
      }
      if (isMissingRpcError(error)) {
        return context.json(
          {
            error: 'Social release cleanup migration has not been applied yet',
          },
          503,
        );
      }
      captureServerException(error, {
        method: context.req.method,
        route: routePath(context),
      });
      return context.json({ error: message }, 503);
    }
  });
  app.get('/api/customers', async (context) => {
    return context.json(await operations.getCustomers(isForced(context)));
  });

  app.get('/api/podcast-pipeline', async (context) => {
    return context.json(await podcastPipeline.getPipeline());
  });
  app.get('/api/pipeline/queues', async (context) => {
    return context.json(await pipelineQueues.getQueues());
  });

  // jscpd:ignore-start -- episodeId validation is duplicated across independent route handlers; merging would obscure route boundaries and is not worth a shared abstraction for 5 lines
  app.get('/api/podcast-pipeline/:episodeId/visual', async (context) => {
    const episodeIdOrResponse = episodeIdOrErrorResponse(context);
    if (typeof episodeIdOrResponse !== 'string') {
      return episodeIdOrResponse;
    }
    const episodeId = episodeIdOrResponse;
    // jscpd:ignore-end
    const response = await podcastVisual.getVisualDebug(episodeId);
    return context.json(response, response.status === 'not-found' ? 404 : 200);
  });

  // Review mutations write only the operator's own review rows through two
  // named RPCs; they never touch pipeline job state.
  app.put('/api/podcast-pipeline/:episodeId/reviews', (context) =>
    handlePodcastReviewMutation(context, {
      idParam: 'episodeId',
      label: 'episode',
      parse: parsePodcastReviewInput,
      work: async (episodeId, review) =>
        context.json(await podcastVisual.upsertReview(episodeId, review)),
    }),
  );

  app.post('/api/podcast-pipeline/reviews/:reviewId/resolve', (context) =>
    handlePodcastReviewMutation(context, {
      idParam: 'reviewId',
      label: 'review',
      parse: parsePodcastReviewResolution,
      work: async (reviewId, resolution) =>
        (await podcastVisual.resolveReview(reviewId, resolution))
          ? context.json({ ok: true })
          : context.json({ error: 'Review not found' }, 404),
    }),
  );

  app.get('/api/statements', async (context) => {
    return context.json(await statements.getStatements(isForced(context)));
  });

  // The Vercel deployment is required to sit behind Vercel Authentication.
  // Inside that authenticated operator surface podcast mutations stay narrowly
  // scoped to checkpoint recovery RPCs; neither route accepts arbitrary state.
  app.post('/api/podcast-pipeline/:episodeId/ingest/retry', (context) =>
    handlePodcastMutation(context, async (episodeId) => {
      await podcastPipeline.restartIngest(episodeId);
    }),
  );

  app.post('/api/podcast-pipeline/:episodeId/video/retry', (context) =>
    handlePodcastMutation(context, async (episodeId) => {
      const body = await context.req.json().catch(() => ({}));
      const forceReplan =
        body && typeof body === 'object' && 'forceReplan' in body
          ? (body as { forceReplan?: unknown }).forceReplan
          : false;
      if (typeof forceReplan !== 'boolean') {
        throw new HTTPException(400, {
          message: 'forceReplan must be boolean',
        });
      }
      await podcastPipeline.restartVideo(episodeId, { forceReplan });
    }),
  );

  app.post(
    '/api/podcast-pipeline/:episodeId/renders/:localizationId/retry',
    (context) =>
      handlePodcastMutation(context, async (episodeId) => {
        const localizationId = context.req.param('localizationId');
        if (!localizationId || !UUID_PATTERN.test(localizationId)) {
          throw new HTTPException(400, { message: 'Invalid localization id' });
        }
        await podcastPipeline.restartRender(episodeId, localizationId);
      }),
  );

  registerOpsMcpHttp(app, {
    operations,
    token: input.config.OPS_MCP_TOKEN,
  });

  app.onError((error, context) => {
    const status = error instanceof HTTPException ? error.status : 500;
    if (status >= 500) {
      captureServerException(error, {
        method: context.req.method,
        route: routePath(context),
      });
    }
    return error instanceof HTTPException
      ? error.getResponse()
      : context.text('Internal Server Error', 500);
  });

  if (input.serveClient !== false) {
    app.use('/*', serveStatic({ root: './dist/client' }));
    app.get('*', serveStatic({ path: './dist/client/index.html' }));
  }
  return app;
}

function uuidParam(context: Context, name: string): string | null {
  const value = context.req.param(name);
  return value && UUID_PATTERN.test(value) ? value : null;
}

function invalidIdResponse(context: Context, label: string) {
  return context.json({ error: `Invalid ${label} id` }, 400);
}

function episodeIdOrErrorResponse(context: Context): string | Response {
  const episodeId = uuidParam(context, 'episodeId');
  if (!episodeId) {
    return invalidIdResponse(context, 'episode');
  }
  return episodeId;
}

type ParsedBody<T> = { ok: true; value: T } | { ok: false; error: string };

async function handlePodcastReviewMutation<T>(
  context: Context,
  input: {
    idParam: string;
    label: string;
    parse: (body: unknown) => ParsedBody<T>;
    work: (id: string, value: T) => Promise<Response>;
  },
) {
  const id = uuidParam(context, input.idParam);
  if (!id) {
    return invalidIdResponse(context, input.label);
  }
  const parsed = input.parse(await context.req.json().catch(() => null));
  if (!parsed.ok) {
    return context.json({ error: parsed.error }, 400);
  }
  try {
    return await input.work(id, parsed.value);
  } catch (error) {
    const mapped = mapPodcastMutationError(
      context,
      error,
      'Podcast review migration has not been applied yet',
    );
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

async function handlePodcastMutation(
  context: Context,
  work: (episodeId: string) => Promise<void>,
) {
  const episodeIdOrResponse = episodeIdOrErrorResponse(context);
  if (typeof episodeIdOrResponse !== 'string') {
    return episodeIdOrResponse;
  }
  const episodeId = episodeIdOrResponse;
  try {
    await work(episodeId);
    return context.json({ ok: true });
  } catch (error) {
    if (error instanceof HTTPException && error.status < 500) {
      return error.getResponse();
    }
    const mapped = mapPodcastMutationError(
      context,
      error,
      'Podcast pipeline database migration has not been applied yet',
    );
    if (mapped) {
      return mapped;
    }
    captureServerException(error, {
      method: context.req.method,
      route: routePath(context),
    });
    return context.json({ error: errorMessage(error) }, 503);
  }
}

/** Stable Postgres codes from the retry RPCs become 409; a missing RPC (code
 * deployed before its migration) becomes an explicit 503. */
function mapPodcastMutationError(
  context: Context,
  error: unknown,
  migrationMessage: string,
): Response | null {
  const message = errorMessage(error);
  if (isPodcastRetryConflict(error, message)) {
    return context.json({ error: message }, 409);
  }
  if (isMissingRpcError(error)) {
    return context.json({ error: migrationMessage }, 503);
  }
  return null;
}

function isForced(context: Context): boolean {
  return context.req.query('force') === '1';
}

function isPodcastRetryConflict(error: unknown, message: string): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (code === '55000' || code === '22023' || code === '23514') {
      return true;
    }
  }
  return (
    message.includes('currently processing') ||
    message.includes('requires completed') ||
    message.includes('has no video visual job') ||
    message.includes('already completed')
  );
}

function parsePodcastReviewInput(
  body: unknown,
): { ok: true; value: PodcastVideoReviewInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Review body must be an object' };
  }
  const row = body as Record<string, unknown>;
  const verdict = row['verdict'];
  if (
    typeof verdict !== 'string' ||
    !(PODCAST_VIDEO_REVIEW_VERDICTS as readonly string[]).includes(verdict)
  ) {
    return { ok: false, error: 'Invalid review verdict' };
  }
  const rawIssues = row['issueCategories'];
  if (
    !Array.isArray(rawIssues) ||
    rawIssues.some(
      (issue) =>
        typeof issue !== 'string' ||
        !(PODCAST_VIDEO_REVIEW_ISSUES as readonly string[]).includes(issue),
    )
  ) {
    return { ok: false, error: 'Invalid review issue categories' };
  }
  const sceneId = optionalNullableString(row['sceneId']);
  if (sceneId && !/^scene-[0-9]{2,3}$/u.test(sceneId)) {
    return { ok: false, error: 'Invalid scene id' };
  }
  const languageCode = optionalNullableString(row['languageCode']);
  if (
    languageCode &&
    languageCode !== 'zh-Hant' &&
    languageCode !== 'ja' &&
    languageCode !== 'en'
  ) {
    return { ok: false, error: 'Invalid review language' };
  }
  const note = optionalNullableString(row['note']);
  if (note && note.length > 2000) {
    return { ok: false, error: 'Review note exceeds 2000 characters' };
  }
  const pipelineContext = row['pipelineContext'];
  if (
    pipelineContext !== undefined &&
    (!pipelineContext ||
      typeof pipelineContext !== 'object' ||
      Array.isArray(pipelineContext) ||
      Buffer.byteLength(JSON.stringify(pipelineContext), 'utf8') > 8192)
  ) {
    return { ok: false, error: 'Invalid review pipeline context' };
  }
  return {
    ok: true,
    value: {
      verdict: verdict as PodcastVideoReviewInput['verdict'],
      issueCategories: rawIssues as PodcastVideoReviewInput['issueCategories'],
      visualHash: optionalNullableString(row['visualHash']),
      languageCode: languageCode as PodcastVideoReviewInput['languageCode'],
      sceneId,
      note,
      pipelineContext:
        pipelineContext && typeof pipelineContext === 'object'
          ? (pipelineContext as Record<string, unknown>)
          : {},
    },
  };
}

function parsePodcastReviewResolution(
  body: unknown,
):
  | { ok: true; value: PodcastVideoReviewResolveInput }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Review resolution body must be an object' };
  }
  const row = body as Record<string, unknown>;
  const status = row['status'];
  if (status !== 'triaged' && status !== 'resolved') {
    return { ok: false, error: 'Review status must be triaged or resolved' };
  }
  const resolutionNote = optionalNullableString(row['resolutionNote']);
  if (resolutionNote && resolutionNote.length > 2000) {
    return { ok: false, error: 'Resolution note exceeds 2000 characters' };
  }
  return { ok: true, value: { status, resolutionNote } };
}

function optionalNullableString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return typeof value === 'string' ? value.trim() || null : null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return 'Podcast retry failed';
}
