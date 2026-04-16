import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/environment.js';
import { logger } from './utils/logger.js';
import { testDatabaseConnection, closeDbPool } from './config/database.js';
import { webhooksRouter } from './routes/webhooks.js';
import { healthRouter } from './routes/health.js';
import { backfillRouter } from './routes/backfill.js';
import { startDatabaseHealthMonitor } from './modules/core/healthMonitor.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app: express.Express = express();
/* c8 ignore next */
const defaultListenHost = env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
/* c8 ignore next */
const listenHost = process.env.HOST ?? defaultListenHost;
const shouldForceListenHost = listenHost !== '0.0.0.0';

/* c8 ignore start */
if (shouldForceListenHost) {
  const originalListen: typeof app.listen = app.listen.bind(app);
  app.listen = ((...args: Parameters<typeof app.listen>): ReturnType<typeof app.listen> => {
    const listenArgs = [...args] as unknown[];

    if (typeof listenArgs[0] === 'number') {
      if (listenArgs.length === 1) {
        listenArgs.push(listenHost);
      } else if (typeof listenArgs[1] !== 'string') {
        listenArgs.splice(1, 0, listenHost);
      }
    }

    return originalListen(...(listenArgs as Parameters<typeof app.listen>));
  }) as typeof app.listen;
}
/* c8 ignore end */

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  const requestId = generateRequestId();
  req.headers['x-request-id'] = requestId;
  logger.info(`${req.method} ${req.path}`, { requestId, ip: req.ip });
  next();
});

app.use('/health', healthRouter);
app.use('/webhooks', webhooksRouter);
app.use('/webhooks/backfill', backfillRouter);

app.get('/', (req, res) => {
  res.json(buildRootResponse());
});

app.use(notFoundHandler);
app.use(errorHandler);

async function runInitialDatabaseCheck(): Promise<void> {
  try {
    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) {
      logger.error('Initial database connectivity check failed. Exiting...');
      process.exit(1);
    }

    logger.info('Initial database connectivity check succeeded.');
  } catch (error) {
    logger.error('Failed to complete initial database connectivity check:', error);
    process.exit(1);
  }
}

function generateRequestId(): string {
  return Math.random().toString(36).substring(7);
}

function buildRootResponse(): {
  name: string;
  version: string;
  status: string;
  timestamp: string;
} {
  return {
    name: 'alpha-etl',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString()
  };
}

function registerShutdownHandlers(
  server: ReturnType<typeof app.listen>
): void {
  const gracefulShutdown = (signal: string) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    server.close(async () => {
      await closeDbPool();
      logger.info('Server closed. Exiting process.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

export async function startServer(): Promise<void> {
  try {
    const server = app.listen(env.PORT, listenHost, () => {
      logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    });

    startDatabaseHealthMonitor();

    void runInitialDatabaseCheck();
    registerShutdownHandlers(server);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

/* istanbul ignore next */
/* c8 ignore start */
if (require.main === module) {
  startServer();
}
/* c8 ignore end */

export { app };
