import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  serve: vi.fn(() => ({
    close: vi.fn((callback?: (error?: Error) => void) => callback?.()),
    closeIdleConnections: vi.fn(),
  })),
  installProcessShutdown: vi.fn(() => ({
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
  createTelegramIngestQueue: vi.fn(() => ({
    enqueue: vi.fn(),
    scheduleMessage: vi.fn(),
    recoverNow: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@hono/node-server', () => ({ serve: mocks.serve }));

vi.mock('./lib/process-shutdown.js', () => ({
  installProcessShutdown: mocks.installProcessShutdown,
}));

vi.mock('./lib/env.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/env.js')>()),
  getPort: () => 0,
  readFlyMachinesConfig: () => null,
}));

vi.mock('./services/telegram-ingest-queue.js', () => ({
  createTelegramIngestQueue: mocks.createTelegramIngestQueue,
}));

describe('index production main entrypoint', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('boots the HTTP server when NODE_ENV is not test', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    await import('./index.js');

    expect(mocks.createTelegramIngestQueue).toHaveBeenCalledTimes(1);
    expect(mocks.serve).toHaveBeenCalledTimes(1);
    expect(mocks.installProcessShutdown).toHaveBeenCalledTimes(1);
  });
});
