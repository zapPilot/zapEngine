import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runCli: vi.fn(),
  isMainModule: vi.fn(() => true),
  renderSlideVideo: vi.fn(),
}));

vi.mock('../../lib/cli-runner.js', () => ({ runCli: mocks.runCli }));
vi.mock('../../lib/is-main-module.js', () => ({
  isMainModule: mocks.isMainModule,
}));
vi.mock('./renderer.js', () => ({
  outputDirectoryLabel: () => 'out',
  renderSlideVideo: mocks.renderSlideVideo,
  describeRenderedVideo: () => 'done',
}));

describe('video cli main entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.runCli.mockReset();
    mocks.isMainModule.mockReturnValue(true);
    mocks.renderSlideVideo.mockResolvedValue({});
  });

  it('registers the video renderer with the shared CLI runner', async () => {
    await import('./cli.js');

    expect(mocks.isMainModule).toHaveBeenCalledOnce();
    expect(mocks.runCli).toHaveBeenCalledOnce();
    const main = mocks.runCli.mock.calls[0]?.[0] as () => Promise<void>;
    const originalArgv = process.argv;
    process.argv = [
      'node',
      'cli',
      '--manifest',
      'manifest.json',
      '--output',
      'out',
    ];
    try {
      await main();
    } finally {
      process.argv = originalArgv;
    }
    expect(mocks.renderSlideVideo).toHaveBeenCalledOnce();
  });
});
