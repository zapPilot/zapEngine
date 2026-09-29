import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runCli: vi.fn(),
  isMainModule: vi.fn(() => true),
}));

vi.mock('../../lib/cli-runner.js', () => ({ runCli: mocks.runCli }));
vi.mock('../../lib/is-main-module.js', () => ({
  isMainModule: mocks.isMainModule,
}));

describe('R2 playback canary main entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('registers and executes the canary CLI callback', async () => {
    const fetchRange = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 206,
        headers: {
          'access-control-allow-origin': '*',
          'content-range': 'bytes 0-1/10',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchRange);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalArgv = process.argv;
    process.argv = ['node', 'canary', 'https://media.example.com/video.mp4'];

    try {
      await import('./r2-playback-canary.js');
      expect(mocks.runCli).toHaveBeenCalledOnce();
      const main = mocks.runCli.mock.calls[0]?.[0] as () => Promise<void>;
      await main();
      expect(fetchRange).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledWith(
        'R2 playback ready: 206 bytes 0-1/10 CORS=*',
      );
    } finally {
      process.argv = originalArgv;
      vi.unstubAllGlobals();
      log.mockRestore();
    }
  });
});
