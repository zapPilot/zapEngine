import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { routePath } from 'hono/route';

import type { SocialPerformanceResponse } from '../shared/types.js';
import type { ControlCenterConfig } from './config/env.js';
import { captureServerException } from './observability/sentry.js';
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
  serveClient?: boolean;
}) {
  const app = new Hono();
  const service =
    input.service ?? createOverviewService({ config: input.config });

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
