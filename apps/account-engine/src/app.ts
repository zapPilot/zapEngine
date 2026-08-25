import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { getErrorStatus, HttpStatus, toErrorResponse } from './common/http';
import { Logger } from './common/logger';
import { createRequestLoggerMiddleware } from './common/middleware';
import {
  type AppServices,
  createContainer,
  startServices,
  stopServices,
} from './container';
import { createPlanOrchestrationRoutes } from './modules/plan-orchestration';
import { captureServerException } from './observability/sentry';
import { createEtlRoutes } from './routes/etl';
import { createHealthRoutes, type ReleaseMetadataEnv } from './routes/health';
import { createJobsRoutes } from './routes/jobs';
import { jsonResponse } from './routes/shared';
import { createTelegramRoutes } from './routes/telegram';
import { createUsersRoutes } from './routes/users';
import { createWalletExecutionRoutes } from './routes/wallet-execution';

const logger = new Logger('Bootstrap');

export function createApp(
  services: AppServices,
  releaseEnv: ReleaseMetadataEnv = process.env,
) {
  const app = new Hono();

  app.use('*', cors());
  app.use('*', createRequestLoggerMiddleware());

  app.route('/health', createHealthRoutes(releaseEnv));
  app.route('/users', createUsersRoutes(services));
  app.route(
    '/plan-orchestration',
    createPlanOrchestrationRoutes(services.planOrchestrationService),
  );
  app.route('/jobs', createJobsRoutes(services));
  app.route('/etl', createEtlRoutes(services));
  app.route('/telegram', createTelegramRoutes(services));
  app.route(
    '/wallet-execution',
    createWalletExecutionRoutes(services.privyWalletExecutionService),
  );

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

  app.onError((error, c) => {
    const status = getErrorStatus(error);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      captureServerException(error, {
        method: c.req.method,
        path: c.req.path,
      });
    }

    return jsonResponse(c, toErrorResponse(c.req.path, error), status);
  });

  return app;
}

/* v8 ignore start -- server bootstrap, not unit-testable */
export function bootstrap(rawEnv: NodeJS.ProcessEnv = process.env) {
  const services = createContainer(rawEnv);
  startServices(services);

  const app = createApp(services, rawEnv);
  const cleanupInterval = setInterval(
    () => services.activityTracker.cleanupCache(),
    60 * 60 * 1000,
  );
  cleanupInterval.unref();

  const server = serve(
    {
      fetch: app.fetch,
      port: services.env.PORT,
      hostname: '0.0.0.0',
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

  process.on('unhandledRejection', (reason) => {
    captureServerException(reason);
    logger.error('Unhandled Rejection:', reason);
  });
  process.on('uncaughtException', (error) => {
    captureServerException(error);
    logger.error('Uncaught Exception:', error);
  });

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  return { app, services, server };
}
/* v8 ignore stop */
