import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertYouTubeChannel: vi.fn(),
  ensureThreadsSession: vi.fn(),
  ensureYouTubeSession: vi.fn(),
  isRednoteSessionReady: vi.fn(),
  isXSessionReady: vi.fn(),
  runRednoteLogin: vi.fn(),
  runXLogin: vi.fn(),
}));

vi.mock('./x-playwright.js', () => ({
  isXSessionReady: mocks.isXSessionReady,
  runXLogin: mocks.runXLogin,
}));

vi.mock('./rednote-login.js', () => ({
  isRednoteSessionReady: mocks.isRednoteSessionReady,
  runRednoteLogin: mocks.runRednoteLogin,
}));

vi.mock('./threads-auth.js', () => ({
  ensureThreadsSession: mocks.ensureThreadsSession,
  THREADS_INSIGHTS_SCOPE: 'threads_manage_insights',
}));

vi.mock('./youtube.js', () => ({
  assertYouTubeChannel: mocks.assertYouTubeChannel,
}));

vi.mock('./youtube-auth.js', () => ({
  ensureYouTubeSession: mocks.ensureYouTubeSession,
  YOUTUBE_ANALYTICS_SCOPE:
    'https://www.googleapis.com/auth/yt-analytics.readonly',
  YOUTUBE_READONLY_SCOPE: 'https://www.googleapis.com/auth/youtube.readonly',
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
    profile: { id: 'threads-1', username: 'zap' },
  });
  mocks.ensureYouTubeSession.mockResolvedValue({
    version: 1,
    accessToken: 'youtube-token',
    refreshToken: 'youtube-refresh',
    expiresAt: Date.now() + 60_000,
    scope: 'https://www.googleapis.com/auth/youtube.upload',
  });
  mocks.assertYouTubeChannel.mockResolvedValue('UC-zap-nomad');
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
      '✓ YouTube UC-zap-nomad',
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

    expect(mocks.runXLogin).toHaveBeenCalledWith(log);
    expect(mocks.runRednoteLogin).toHaveBeenCalledWith(log);
    expect(log).toHaveBeenCalledWith('• X is not logged in. Opening Chrome...');
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
    expect(mocks.runXLogin).toHaveBeenCalledWith(log);
    expect(log).toHaveBeenCalledWith(
      '✗ X: X login finished but the publisher is still not authenticated.',
    );
  });

  it('reports a YouTube failure and still checks Rednote', async () => {
    const log = vi.fn();
    mocks.ensureYouTubeSession.mockRejectedValue(new Error('OAuth revoked'));

    await expect(runSocialLogin(log)).rejects.toThrow(
      'Social login incomplete: YouTube.',
    );

    expect(mocks.isRednoteSessionReady).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('✗ YouTube: OAuth revoked');
    expect(log).toHaveBeenCalledWith('✓ Rednote');
  });

  it('fails YouTube login when the session authorized the wrong channel', async () => {
    const log = vi.fn();
    mocks.assertYouTubeChannel.mockRejectedValue(
      new Error('The signed-in Google account cannot report on channel UC-x.'),
    );

    await expect(runSocialLogin(log)).rejects.toThrow(
      'Social login incomplete: YouTube.',
    );

    expect(mocks.assertYouTubeChannel).toHaveBeenCalledWith({
      accessToken: 'youtube-token',
    });
    expect(log).toHaveBeenCalledWith(
      '✗ YouTube: The signed-in Google account cannot report on channel UC-x.',
    );
  });

  it('reports a Rednote login failure without hiding earlier platform success', async () => {
    const log = vi.fn();
    mocks.isRednoteSessionReady.mockResolvedValue(false);
    mocks.runRednoteLogin.mockRejectedValue(new Error('Chrome closed'));

    await expect(runSocialLogin(log)).rejects.toThrow(
      'Social login incomplete: Rednote.',
    );

    expect(log).toHaveBeenCalledWith('✓ X');
    expect(log).toHaveBeenCalledWith('✓ Threads @zap');
    expect(log).toHaveBeenCalledWith('✓ YouTube UC-zap-nomad');
    expect(log).toHaveBeenCalledWith('✗ Rednote: Chrome closed');
  });

  it('aggregates independent failures and renders non-Error reasons', async () => {
    const log = vi.fn();
    mocks.isXSessionReady.mockResolvedValue(false);
    mocks.runXLogin.mockRejectedValue('browser unavailable');
    mocks.ensureThreadsSession.mockRejectedValue(new Error('threads down'));
    mocks.ensureYouTubeSession.mockRejectedValue(new Error('youtube down'));
    mocks.isRednoteSessionReady.mockRejectedValue(new Error('rednote down'));

    await expect(runSocialLogin(log)).rejects.toThrow(
      'Social login incomplete: X, Threads, YouTube, Rednote.',
    );

    expect(log).toHaveBeenCalledWith('✗ X: browser unavailable');
    expect(log).toHaveBeenCalledWith('✗ Threads: threads down');
    expect(log).toHaveBeenCalledWith('✗ YouTube: youtube down');
    expect(log).toHaveBeenCalledWith('✗ Rednote: rednote down');
  });
});
