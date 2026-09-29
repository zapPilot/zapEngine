import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runCli: vi.fn(),
  isMainModule: vi.fn(() => true),
  isXSessionReady: vi.fn(),
  ensureThreadsSession: vi.fn(),
  ensureYouTubeSession: vi.fn(),
  assertYouTubeChannel: vi.fn(),
  isRednoteSessionReady: vi.fn(),
}));

vi.mock('../lib/cli-runner.js', () => ({ runCli: mocks.runCli }));
vi.mock('../lib/is-main-module.js', () => ({
  isMainModule: mocks.isMainModule,
}));
vi.mock('./x-playwright.js', () => ({
  isXSessionReady: mocks.isXSessionReady,
  runXLogin: vi.fn(),
}));
vi.mock('./threads-auth.js', () => ({
  ensureThreadsSession: mocks.ensureThreadsSession,
  THREADS_INSIGHTS_SCOPE: 'threads_manage_insights',
}));
vi.mock('./youtube-auth.js', () => ({
  ensureYouTubeSession: mocks.ensureYouTubeSession,
  YOUTUBE_ANALYTICS_SCOPE: 'analytics',
  YOUTUBE_READONLY_SCOPE: 'readonly',
}));
vi.mock('./youtube.js', () => ({
  assertYouTubeChannel: mocks.assertYouTubeChannel,
}));
vi.mock('./rednote-login.js', () => ({
  isRednoteSessionReady: mocks.isRednoteSessionReady,
  runRednoteLogin: vi.fn(),
}));

describe('social login main entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.runCli.mockReset();
    mocks.isMainModule.mockReturnValue(true);
    mocks.isXSessionReady.mockResolvedValue(true);
    mocks.ensureThreadsSession.mockResolvedValue({
      profile: { username: 'zap' },
    });
    mocks.ensureYouTubeSession.mockResolvedValue({ accessToken: 'token' });
    mocks.assertYouTubeChannel.mockResolvedValue('UC-test');
    mocks.isRednoteSessionReady.mockResolvedValue(true);
  });

  it('registers social login with the shared CLI runner', async () => {
    await import('./login.js');

    expect(mocks.isMainModule).toHaveBeenCalledOnce();
    expect(mocks.runCli).toHaveBeenCalledOnce();
    const main = mocks.runCli.mock.calls[0]?.[0] as () => Promise<void>;
    await main();
    expect(mocks.assertYouTubeChannel).toHaveBeenCalledOnce();
  });
});
