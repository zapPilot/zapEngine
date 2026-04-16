import { HttpStatus, toErrorResponse } from '@common/http';
import { createActivityTrackingMiddleware } from '@common/interceptors';
import { Logger } from '@common/logger';
import { createRequestLoggerMiddleware } from '@common/middleware';
import {
  type AppServices,
  createContainer,
  startServices,
  stopServices,
} from '@container';
import { serve } from '@hono/node-server';
import { createEtlRoutes } from '@routes/etl';
import { createHealthRoutes } from '@routes/health';
import { createJobsRoutes } from '@routes/jobs';
import { jsonResponse } from '@routes/shared';
import { createTelegramRoutes } from '@routes/telegram';
import { createUsersRoutes } from '@routes/users';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const logger = new Logger('Bootstrap');

export function createApp(services: AppServices) {
  const app = new Hono();

  app.use('*', cors());
  app.use('*', createRequestLoggerMiddleware());
  app.use(
    '/users/*',
    createActivityTrackingMiddleware(services.activityTracker),
  );

  app.route('/health', createHealthRoutes());
  app.route('/users', createUsersRoutes(services));
  app.route('/jobs', createJobsRoutes(services));
  app.route('/etl', createEtlRoutes(services));
  app.route('/telegram', createTelegramRoutes(services));

  app.notFound((c) =>
    jsonResponse(
      c,
      toErrorResponse(c.req.path, {
        message: 'Route not found',
        statusCode: HttpStatus.NOT_FOUND,
      }),
      HttpStatus.NOT_FOUND,
    ),
  );

  app.onError((error, c) =>
    jsonResponse(
      c,
      toErrorResponse(c.req.path, error),
      error instanceof Error && 'statusCode' in error
        ? Number(error.statusCode)
        : HttpStatus.INTERNAL_SERVER_ERROR,
    ),
  );

  return app;
}

/* istanbul ignore next -- server bootstrap, not unit-testable */
export function bootstrap(rawEnv: NodeJS.ProcessEnv = process.env) {
  const services = createContainer(rawEnv);
  startServices(services);

  const app = createApp(services);
  const cleanupInterval = setInterval(
    () => services.activityTracker.cleanupCache(),
    60 * 60 * 1000,
  );
  cleanupInterval.unref();

  const server = serve(
    {
      fetch: app.fetch,
      port: services.env.server.port,
    },
    (info) => {
      logger.log(`Account Engine API running on http://localhost:${info.port}`);
    },
  );

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}, shutting down gracefully...`);
    clearInterval(cleanupInterval);
    server.close();
    await stopServices(services);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  return { app, services, server };
}
