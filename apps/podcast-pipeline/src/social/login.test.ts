import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureThreadsSession: vi.fn(),
  isRednoteSessionReady: vi.fn(),
  isXSessionReady: vi.fn(),
  runRednoteLogin: vi.fn(),
  runXLogin: vi.fn(),
}));

vi.mock('./opencli.js', () => ({
  isXSessionReady: mocks.isXSessionReady,
  runXLogin: mocks.runXLogin,
}));

vi.mock('./rednote-login.js', () => ({
  isRednoteSessionReady: mocks.isRednoteSessionReady,
  runRednoteLogin: mocks.runRednoteLogin,
}));

vi.mock('./threads-auth.js', () => ({
  ensureThreadsSession: mocks.ensureThreadsSession,
}));

import { runSocialLogin } from './login.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isXSessionReady.mockResolvedValue(true);
  mocks.ensureThreadsSession.mockResolvedValue({
    session: {
      version: 1,
      accessToken: 'token',
      userId: 'threads-1',
      username: 'zap',
      expiresAt: Date.now() + 60_000,
    },
    profile: {
      id: 'threads-1',
      username: 'zap',
    },
  });
  mocks.isRednoteSessionReady.mockResolvedValue(true);
});

describe('runSocialLogin', () => {
  it('only reports already-ready platforms without opening login flows', async () => {
    const log = vi.fn();

    await runSocialLogin(log);

    expect(mocks.runXLogin).not.toHaveBeenCalled();
    expect(mocks.runRednoteLogin).not.toHaveBeenCalled();
    expect(log.mock.calls.map(([message]) => message)).toEqual([
      'Checking social sessions...',
      '✓ X',
      '✓ Threads @zap',
      '✓ Rednote',
      'All social platforms are ready.',
    ]);
  });

  it('logs in only missing X and Rednote sessions', async () => {
    const log = vi.fn();
    mocks.isXSessionReady
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    mocks.isRednoteSessionReady.mockResolvedValue(false);

    await runSocialLogin(log);

    expect(mocks.runXLogin).toHaveBeenCalledOnce();
    expect(mocks.runRednoteLogin).toHaveBeenCalledWith(log);
    expect(log).toHaveBeenCalledWith(
      '• X is not logged in. Starting OpenCLI login...',
    );
    expect(log).toHaveBeenCalledWith(
      '• Rednote is not logged in. Opening Chrome...',
    );
  });

  it('reports a Threads OAuth failure but continues checking Rednote', async () => {
    const log = vi.fn();
    mocks.ensureThreadsSession.mockRejectedValue(
      new Error('Threads API 401: Invalid OAuth access token.'),
    );

    await expect(runSocialLogin(log)).rejects.toThrow(
      'Social login incomplete: Threads.',
    );

    expect(mocks.isRednoteSessionReady).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      '✗ Threads: Threads API 401: Invalid OAuth access token.',
    );
  });

  it('fails X when login completes without an authenticated session', async () => {
    const log = vi.fn();
    mocks.isXSessionReady.mockResolvedValue(false);

    await expect(runSocialLogin(log)).rejects.toThrow(
      'Social login incomplete: X.',
    );

    expect(mocks.runXLogin).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      '✗ X: OpenCLI login finished but X is still not authenticated.',
    );
  });
});
