import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runCli: vi.fn(),
  isMainModule: vi.fn(() => true),
  listReviewsForExport: vi.fn(),
}));

vi.mock('../../../lib/cli-runner.js', () => ({ runCli: mocks.runCli }));
vi.mock('../../../lib/is-main-module.js', () => ({
  isMainModule: mocks.isMainModule,
}));
vi.mock('./review-store.js', () => ({
  listReviewsForExport: mocks.listReviewsForExport,
  resolveReview: vi.fn(),
}));

describe('review cli main entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.runCli.mockReset();
    mocks.isMainModule.mockReturnValue(true);
    mocks.listReviewsForExport.mockResolvedValue([]);
  });

  it('registers the review command with the shared CLI runner', async () => {
    await import('./cli.js');

    expect(mocks.isMainModule).toHaveBeenCalledOnce();
    expect(mocks.runCli).toHaveBeenCalledOnce();
    const main = mocks.runCli.mock.calls[0]?.[0] as () => Promise<void>;
    const originalArgv = process.argv;
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    process.argv = ['node', 'cli', 'export'];
    try {
      await main();
    } finally {
      process.argv = originalArgv;
      write.mockRestore();
    }
    expect(mocks.listReviewsForExport).toHaveBeenCalledOnce();
  });
});
