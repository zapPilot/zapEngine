import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isMainModule: vi.fn(() => true),
  access: vi.fn(),
  mkdtemp: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
  runProcess: vi.fn(),
  info: vi.fn(),
}));

vi.mock('../../lib/is-main-module.js', () => ({
  isMainModule: mocks.isMainModule,
}));

vi.mock('node:fs/promises', () => ({
  access: mocks.access,
  mkdtemp: mocks.mkdtemp,
  rm: mocks.rm,
  writeFile: mocks.writeFile,
}));

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    stats: vi.fn().mockResolvedValue({
      channels: [{ max: 255 }, { max: 128 }, { max: 64 }],
    }),
  })),
}));

vi.mock('./ffmpeg-video.js', () => ({
  resolveVideoFfmpegPath: () => '/mock/ffmpeg',
  runProcess: mocks.runProcess,
  assertVideoFfmpegCapabilities: vi.fn().mockResolvedValue(undefined),
}));

describe('runtime preflight main entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.mkdtemp.mockResolvedValue('/workspace/subtitle-smoke');
    mocks.runProcess.mockResolvedValue({ stdout: '', stderr: '' });
  });

  it('runs the subtitle smoke and logs the verified runtime when invoked as main', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(mocks.info);

    await import('./runtime-preflight.js');

    expect(mocks.isMainModule).toHaveBeenCalledOnce();
    expect(mocks.runProcess).toHaveBeenCalledTimes(2);
    expect(mocks.info).toHaveBeenCalledWith(
      expect.stringContaining('maxChannel=255'),
    );
    expect(mocks.rm).toHaveBeenCalledWith('/workspace/subtitle-smoke', {
      recursive: true,
      force: true,
    });
    info.mockRestore();
  });
});
