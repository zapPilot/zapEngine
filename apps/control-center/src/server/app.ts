import { serveStatic } from '@hono/node-server/serve-static';
import { type Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { routePath } from 'hono/route';

import type { SocialPerformanceResponse } from '../shared/types.js';
import type { ControlCenterConfig } from './config/env.js';
import { registerOpsMcpHttp } from './mcp/http.js';
import { captureServerException } from './observability/sentry.js';
import { createOperationsService } from './services/operations/aggregate.js';
import { createOverviewService } from './services/overview.js';
import { createPodcastCostService } from './services/podcast-costs.js';
import { createPodcastPipelineService } from './services/podcast-pipeline.js';
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
  // Injected separately from the overview service on purpose: the two share no
  // state, and folding operations into createOverviewService would force every
  // existing fake of it to grow methods its tests do not care about.
  const operations =
    input.operations ?? createOperationsService({ config: input.config });
  const socialGrowth =
    input.socialGrowth ?? createSocialGrowthService({ config: input.config });
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
  app.get('/api/customers', async (context) => {
    return context.json(await operations.getCustomers(isForced(context)));
  });

  app.get('/api/podcast-pipeline', async (context) => {
    return context.json(await podcastPipeline.getPipeline());
  });

  app.get('/api/statements', async (context) => {
    return context.json(await statements.getStatements(isForced(context)));
  });

  // The Vercel deployment is required to sit behind Vercel Authentication.
  // Inside that authenticated operator surface podcast mutations stay narrowly
  // scoped to checkpoint recovery RPCs; neither route accepts arbitrary state.
  app.post('/api/podcast-pipeline/:episodeId/ingest/retry', async (context) => {
    const episodeId = context.req.param('episodeId');
    if (!UUID_PATTERN.test(episodeId)) {
      return context.json({ error: 'Invalid episode id' }, 400);
    }
    try {
      await podcastPipeline.restartIngest(episodeId);
      return context.json({ ok: true });
    } catch (error) {
      const message = errorMessage(error);
      if (isPodcastRetryConflict(error, message)) {
        return context.json({ error: message }, 409);
      }
      captureServerException(error, {
        method: context.req.method,
        route: routePath(context),
      });
      return context.json({ error: message }, 503);
    }
  });

  app.post('/api/podcast-pipeline/:episodeId/video/retry', async (context) => {
    const episodeId = context.req.param('episodeId');
    if (!UUID_PATTERN.test(episodeId)) {
      return context.json({ error: 'Invalid episode id' }, 400);
    }
    try {
      await podcastPipeline.restartVideo(episodeId);
      return context.json({ ok: true });
    } catch (error) {
      const message = errorMessage(error);
      if (isPodcastRetryConflict(error, message)) {
        return context.json({ error: message }, 409);
      }
      captureServerException(error, {
        method: context.req.method,
        route: routePath(context),
      });
      return context.json({ error: message }, 503);
    }
  });

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

/**
 * `?force=1` bypasses the per-source cache. It exists for the refresh button
 * and for an operator who has just fixed something and wants to see it, not as
 * a default: a forced snapshot re-hits every provider at once.
 */
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
