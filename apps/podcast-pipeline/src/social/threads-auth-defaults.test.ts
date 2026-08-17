import { beforeEach, describe, expect, it, vi } from 'vitest';

const fsMocks = vi.hoisted(() => ({
  chmod: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn(),
  rename: vi.fn(),
  unlink: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => fsMocks);

import {
  assertThreadsSessionReady,
  DEFAULT_THREADS_SESSION_PATH,
  readThreadsSession,
  type ThreadsSession,
  writeThreadsSession,
} from './threads-auth.js';

const session: ThreadsSession = {
  version: 1,
  accessToken: 'access',
  expiresAt: 2_000_000,
  userId: 'user-1',
  username: 'zap',
};

beforeEach(() => {
  vi.clearAllMocks();
  fsMocks.chmod.mockResolvedValue(undefined);
  fsMocks.mkdir.mockResolvedValue(undefined);
  fsMocks.rename.mockResolvedValue(undefined);
  fsMocks.writeFile.mockResolvedValue(undefined);
});

describe('Threads session default filesystem wiring', () => {
  it('reads the default session path and treats ENOENT as logged out', async () => {
    fsMocks.readFile.mockRejectedValue(
      Object.assign(new Error('missing'), { code: 'ENOENT' }),
    );

    await expect(readThreadsSession()).resolves.toBeNull();
    expect(fsMocks.readFile).toHaveBeenCalledWith(
      DEFAULT_THREADS_SESSION_PATH,
      'utf8',
    );
  });

  it('uses the default session path when checking login readiness', async () => {
    fsMocks.readFile.mockRejectedValue(
      Object.assign(new Error('missing'), { code: 'ENOENT' }),
    );

    await expect(assertThreadsSessionReady()).rejects.toThrow(
      'Threads is not logged in',
    );
    expect(fsMocks.readFile).toHaveBeenCalledWith(
      DEFAULT_THREADS_SESSION_PATH,
      'utf8',
    );
  });

  it('surfaces a non-ENOENT temporary-file cleanup failure on the default path', async () => {
    fsMocks.unlink.mockRejectedValue(
      Object.assign(new Error('cleanup denied'), { code: 'EACCES' }),
    );

    await expect(writeThreadsSession(session)).rejects.toThrow(
      'cleanup denied',
    );
    expect(fsMocks.rename).toHaveBeenCalledWith(
      expect.stringContaining(`${DEFAULT_THREADS_SESSION_PATH}.tmp-`),
      DEFAULT_THREADS_SESSION_PATH,
    );
  });
});
