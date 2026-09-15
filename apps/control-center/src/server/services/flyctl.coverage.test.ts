import { describe, expect, it, vi } from 'vitest';

import { runFlyctl } from './flyctl.js';

const execAsync = vi.hoisted(() => vi.fn());

vi.mock('node:util', () => ({
  promisify: () => execAsync,
}));

describe('runFlyctl coverage', () => {
  it('returns stdout with the timeout and buffer guards', async () => {
    execAsync.mockImplementationOnce(
      (_cmd: unknown, _args: unknown, _opts: unknown) => {
        expect(_cmd).toBe('flyctl');
        expect(_opts).toMatchObject({
          timeout: 20_000,
          maxBuffer: 10 * 1024 * 1024,
        });
        return Promise.resolve({ stdout: 'ok\n', stderr: '' });
      },
    );
    await expect(runFlyctl(['machines', 'list'])).resolves.toBe('ok\n');
  });

  it('rejects when flyctl fails', async () => {
    execAsync.mockRejectedValueOnce(new Error('flyctl boom'));
    await expect(runFlyctl(['status'])).rejects.toThrow('flyctl boom');
  });
});
