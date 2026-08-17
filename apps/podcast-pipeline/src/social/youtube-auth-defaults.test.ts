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
  assertYouTubeSessionReady,
  DEFAULT_YOUTUBE_SESSION_PATH,
  readYouTubeSession,
  writeYouTubeSession,
  type YouTubeSession,
} from './youtube-auth.js';

const session: YouTubeSession = {
  version: 1,
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: 2_000_000,
  scope: 'https://www.googleapis.com/auth/youtube.upload',
};

beforeEach(() => {
  vi.clearAllMocks();
  fsMocks.chmod.mockResolvedValue(undefined);
  fsMocks.mkdir.mockResolvedValue(undefined);
  fsMocks.rename.mockResolvedValue(undefined);
  fsMocks.writeFile.mockResolvedValue(undefined);
});

describe('YouTube session default filesystem wiring', () => {
  it('reads the default session path and treats ENOENT as logged out', async () => {
    fsMocks.readFile.mockRejectedValue(
      Object.assign(new Error('missing'), { code: 'ENOENT' }),
    );

    await expect(readYouTubeSession()).resolves.toBeNull();
    expect(fsMocks.readFile).toHaveBeenCalledWith(
      DEFAULT_YOUTUBE_SESSION_PATH,
      'utf8',
    );
  });

  it('uses the default session path when checking login readiness', async () => {
    fsMocks.readFile.mockRejectedValue(
      Object.assign(new Error('missing'), { code: 'ENOENT' }),
    );

    await expect(assertYouTubeSessionReady()).rejects.toThrow(
      'YouTube is not logged in',
    );
    expect(fsMocks.readFile).toHaveBeenCalledWith(
      DEFAULT_YOUTUBE_SESSION_PATH,
      'utf8',
    );
  });

  it('surfaces a non-ENOENT temporary-file cleanup failure on the default path', async () => {
    fsMocks.unlink.mockRejectedValue(
      Object.assign(new Error('cleanup denied'), { code: 'EACCES' }),
    );

    await expect(writeYouTubeSession(session)).rejects.toThrow(
      'cleanup denied',
    );
    expect(fsMocks.rename).toHaveBeenCalledWith(
      expect.stringContaining(`${DEFAULT_YOUTUBE_SESSION_PATH}.tmp-`),
      DEFAULT_YOUTUBE_SESSION_PATH,
    );
  });
});
