import { serveStatic } from '@hono/node-server/serve-static';
import { type Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { routePath } from 'hono/route';

import type { SocialPerformanceResponse } from '../shared/types.js';
import type { ControlCenterConfig } from './config/env.js';
import { captureServerException } from './observability/sentry.js';
import { createOperationsService } from './services/operations/aggregate.js';
import { createOverviewService } from './services/overview.js';

const WINDOWS: SocialPerformanceResponse['window'][] = [
  'latest',
  '24h',
  '72h',
  '7d',
];

export function createControlCenterApp(input: {
  config: ControlCenterConfig;
  service?: ReturnType<typeof createOverviewService>;
  operations?: ReturnType<typeof createOperationsService>;
  serveClient?: boolean;
}) {
  const app = new Hono();
  const service =
    input.service ?? createOverviewService({ config: input.config });
  // Injected separately from the overview service on purpose: the two share no
  // state, and folding operations into createOverviewService would force every
  // existing fake of it to grow methods its tests do not care about.
  const operations =
    input.operations ?? createOperationsService({ config: input.config });

  app.get('/api/overview', async (context) => {
    return context.json(await service.getOverview());
  });
  app.get('/api/costs/history', async (context) => {
    return context.json(await service.getCostHistory());
  });
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
  app.get('/api/social-performance', async (context) => {
    const requested = context.req.query('window');
    const window = WINDOWS.includes(
      requested as SocialPerformanceResponse['window'],
    )
      ? (requested as SocialPerformanceResponse['window'])
      : 'latest';
    return context.json(await service.getSocial(window));
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
