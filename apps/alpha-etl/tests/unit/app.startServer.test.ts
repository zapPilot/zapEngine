import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/config/environment.js', () => ({
  env: {
    PORT: 3001,
    NODE_ENV: 'test'
  }
}));

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
};

vi.mock('../../src/utils/logger.js', () => ({
  logger: mockLogger
}));

vi.mock('../../src/config/database.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config/database.js')>();
  return {
    ...actual,
    testDatabaseConnection: vi.fn().mockResolvedValue(true),
    getDbPool: vi.fn(() => ({
      query: vi.fn(),
      connect: vi.fn(),
      end: vi.fn()
    }))
  };
});

vi.mock('../../src/modules/core/healthMonitor.js', () => ({
  startDatabaseHealthMonitor: vi.fn()
}));

describe('startServer error handling', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('logs and exits when server fails to start', async () => {
    const { startServer, app } = await import('../../src/app.js');

    const listenSpy = vi.spyOn(app, 'listen').mockImplementation(() => {
      throw new Error('listen failed');
    });

    await startServer();

    expect(mockLogger.error).toHaveBeenCalledWith('Failed to start server:', expect.any(Error));
    expect(exitSpy).toHaveBeenCalledWith(1);

    listenSpy.mockRestore();
  });
});
