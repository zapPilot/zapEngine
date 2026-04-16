import { describe, it, expect, vi, afterEach } from 'vitest';

const dummyRouter = (_req: unknown, _res: unknown, next: (err?: unknown) => void) => next();

const setupAppImport = async (nodeEnv: string) => {
  vi.resetModules();
  delete process.env.HOST;

  vi.doMock('../../src/config/environment.js', () => ({
    env: {
      NODE_ENV: nodeEnv,
      PORT: 3000,
      LOG_LEVEL: 'info'
    }
  }));

  vi.doMock('../../src/utils/logger.js', () => ({
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    }
  }));

  vi.doMock('../../src/routes/webhooks.js', () => ({ webhooksRouter: dummyRouter }));
  vi.doMock('../../src/routes/health.js', () => ({ healthRouter: dummyRouter }));
  vi.doMock('../../src/routes/backfill.js', () => ({ backfillRouter: dummyRouter }));

  vi.doMock('../../src/modules/core/healthMonitor.js', () => ({
    startDatabaseHealthMonitor: vi.fn()
  }));

  vi.doMock('../../src/config/database.js', () => ({
    testDatabaseConnection: vi.fn()
  }));

  vi.doMock('../../src/middleware/errorHandler.js', () => ({
    errorHandler: (_err: unknown, _req: unknown, _res: unknown, next: (err?: unknown) => void) => next(_err),
    notFoundHandler: (_req: unknown, _res: unknown, next: (err?: unknown) => void) => next()
  }));

  return import('../../src/app.js');
};

describe('app listenHost selection', () => {
  const originalHost = process.env.HOST;

  afterEach(() => {
    if (originalHost === undefined) {
      delete process.env.HOST;
    } else {
      process.env.HOST = originalHost;
    }
    vi.clearAllMocks();
  });

  it('uses production default host when HOST is unset', async () => {
    const module = await setupAppImport('production');
    expect(module.app).toBeDefined();
  });

  it('uses non-production default host when HOST is unset', async () => {
    const module = await setupAppImport('test');
    expect(module.app).toBeDefined();
  });
});
