import { afterEach, describe, expect, it, vi } from 'vitest';

import { runCli } from './cli-runner.js';

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe('runCli', () => {
  it('runs an async entrypoint to completion', async () => {
    const main = vi.fn().mockResolvedValue(undefined);
    runCli(main);
    await flush();
    expect(main).toHaveBeenCalledOnce();
    expect(process.exitCode).toBeUndefined();
  });

  it('reports a rejected entrypoint and marks the process failed', async () => {
    const error = new Error('cli failed');
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    runCli(vi.fn().mockRejectedValue(error));
    await flush();
    expect(consoleError).toHaveBeenCalledWith(error);
    expect(process.exitCode).toBe(1);
  });
});
