import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';

import type { SocialPerformanceResponse } from '../shared/types.js';
import type { ControlCenterConfig } from './config/env.js';
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

  if (input.serveClient !== false) {
    app.use('/*', serveStatic({ root: './dist/client' }));
    app.get('*', serveStatic({ path: './dist/client/index.html' }));
  }
  return app;
}
