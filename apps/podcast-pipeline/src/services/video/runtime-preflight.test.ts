/* eslint-disable sonarjs/publicly-writable-directories -- test uses controlled /tmp paths as mock harness data */
import { describe, expect, it, vi } from 'vitest';

import type { VideoProcessResult, VideoProcessRunner } from './ffmpeg-video.js';
import { assertVideoRenderRuntime } from './runtime-preflight.js';

function capableRunner() {
  return vi.fn<VideoProcessRunner>(
    async (_executable, args): Promise<VideoProcessResult> => {
      if (args.includes('-filters')) {
        return {
          stdout:
            'xfade zoompan ass overlay pad fade apad afade amix asplit aformat sidechaincompress',
          stderr: '',
        };
      }
      if (args.includes('-encoders')) {
        return { stdout: 'libx264 aac', stderr: '' };
      }
      if (args.includes('-h')) {
        return { stdout: 'normalize', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    },
  );
}

function dependencies(
  overrides: {
    processRunner?: ReturnType<typeof capableRunner>;
    readFrameMaxChannel?: ReturnType<
      typeof vi.fn<(path: string) => Promise<number>>
    >;
  } = {},
) {
  return {
    accessFile: vi.fn(async () => undefined),
    makeTemporaryDirectory: vi.fn(async () => '/tmp/subtitle-smoke'),
    writeText: vi.fn(async () => undefined),
    removeDirectory: vi.fn(async () => undefined),
    processRunner: overrides.processRunner ?? capableRunner(),
    readFrameMaxChannel:
      overrides.readFrameMaxChannel ?? vi.fn(async () => 244),
  };
}

describe('assertVideoRenderRuntime', () => {
  it('fails closed on missing ffmpeg capabilities before a worker can claim jobs', async () => {
    const processRunner = capableRunner();
    processRunner.mockImplementation(async (_executable, args) => {
      if (args.includes('-filters')) {
        return { stdout: 'xfade zoompan overlay', stderr: '' };
      }
      if (args.includes('-encoders')) {
        return { stdout: 'libx264 aac', stderr: '' };
      }
      if (args.includes('-h')) return { stdout: 'normalize', stderr: '' };
      return { stdout: '', stderr: '' };
    });
    const deps = dependencies({ processRunner });

    await expect(
      assertVideoRenderRuntime({
        ffmpegPath: '/usr/bin/ffmpeg',
        dependencies: deps,
      }),
    ).rejects.toThrow('FFmpeg is missing');
    expect(deps.makeTemporaryDirectory).not.toHaveBeenCalled();
  });

  it('checks packaged fonts and capabilities without paying the pixel-smoke cost on worker startup', async () => {
    const deps = dependencies();

    const report = await assertVideoRenderRuntime({
      ffmpegPath: '/usr/bin/ffmpeg',
      dependencies: deps,
    });

    expect(deps.accessFile).toHaveBeenCalledTimes(2);
    expect(deps.processRunner).toHaveBeenCalledTimes(3);
    expect(deps.makeTemporaryDirectory).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      ffmpegPath: '/usr/bin/ffmpeg',
      subtitleBurnInVerified: false,
      subtitleFrameMaxChannel: null,
    });
  });

  it('renders and inspects a real subtitle frame for the production-image smoke', async () => {
    const deps = dependencies();

    const report = await assertVideoRenderRuntime({
      ffmpegPath: '/usr/bin/ffmpeg',
      verifySubtitleBurnIn: true,
      dependencies: deps,
    });

    expect(deps.writeText).toHaveBeenCalledWith(
      '/tmp/subtitle-smoke/captions.ass',
      expect.stringContaining('Dialogue: 0,0:00:00.00,0:00:01.00'),
    );
    const renderCall = deps.processRunner.mock.calls.find(([, args]) =>
      args.includes('-vf'),
    );
    expect(renderCall?.[1].join(' ')).toContain('ass=filename=');
    expect(renderCall?.[1].join(' ')).toContain('fontsdir=');
    expect(deps.readFrameMaxChannel).toHaveBeenCalledWith(
      '/tmp/subtitle-smoke/subtitle-smoke.png',
    );
    expect(deps.removeDirectory).toHaveBeenCalledWith('/tmp/subtitle-smoke');
    expect(report).toMatchObject({
      subtitleBurnInVerified: true,
      subtitleFrameMaxChannel: 244,
    });
  });

  it('rejects an image where ffmpeg produced no visible subtitle pixels and still cleans up', async () => {
    const deps = dependencies({
      readFrameMaxChannel: vi.fn(async () => 16),
    });

    await expect(
      assertVideoRenderRuntime({
        ffmpegPath: '/usr/bin/ffmpeg',
        verifySubtitleBurnIn: true,
        dependencies: deps,
      }),
    ).rejects.toThrow('produced no visible subtitle pixels');
    expect(deps.removeDirectory).toHaveBeenCalledWith('/tmp/subtitle-smoke');
  });
});
