import { describe, expect, it, vi } from 'vitest';

import { installProcessShutdown } from './process-shutdown.js';

describe('installProcessShutdown', () => {
  it('runs teardown once and returns the process to its original listener count', async () => {
    const startSigint = process.listenerCount('SIGINT');
    const startSigterm = process.listenerCount('SIGTERM');
    const teardown = vi.fn().mockResolvedValue(undefined);

    const { shutdown } = installProcessShutdown(teardown);
    expect(process.listenerCount('SIGINT')).toBe(startSigint + 1);
    expect(process.listenerCount('SIGTERM')).toBe(startSigterm + 1);

    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);
    expect(teardown).toHaveBeenCalledTimes(1);
    expect(teardown).toHaveBeenCalledWith('SIGTERM');

    await shutdown('SIGTERM');
    expect(teardown).toHaveBeenCalledTimes(1);
    expect(process.listenerCount('SIGINT')).toBe(startSigint);
    expect(process.listenerCount('SIGTERM')).toBe(startSigterm);
  });

  it('labels a shutdown that no signal triggered', async () => {
    const teardown = vi.fn().mockResolvedValue(undefined);

    await installProcessShutdown(teardown).shutdown();
    expect(teardown).toHaveBeenCalledWith('shutdown');
  });

  it('runs teardown when the process receives SIGINT or SIGTERM', async () => {
    const teardown = vi.fn().mockResolvedValue(undefined);
    installProcessShutdown(teardown);

    process.emit('SIGINT', 'SIGINT');
    await vi.waitFor(() => expect(teardown).toHaveBeenCalledWith('SIGINT'));

    const secondTeardown = vi.fn().mockResolvedValue(undefined);
    installProcessShutdown(secondTeardown);
    process.emit('SIGTERM', 'SIGTERM');
    await vi.waitFor(() =>
      expect(secondTeardown).toHaveBeenCalledWith('SIGTERM'),
    );
  });
});
