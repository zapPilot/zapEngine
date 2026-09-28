import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ffmpegMocks = vi.hoisted(() => ({ runProcess: vi.fn() }));

vi.mock('../services/video/ffmpeg-video.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../services/video/ffmpeg-video.js')>();
  return { ...original, runProcess: ffmpegMocks.runProcess };
});

import { prepareXTeaserVideo, X_VIDEO_LIMIT_SECONDS } from './video.js';

const EPISODE_ID = `video-coverage-${process.pid}`;
const DIRECTORY = join(tmpdir(), 'zap-pilot-social');
const SOURCE_PATH = join(DIRECTORY, `coverage-source-${process.pid}.mp4`);

afterEach(async () => {
  vi.clearAllMocks();
});

describe('video coverage gaps', () => {
  it('uses the shared process runner when no override is supplied', async () => {
    // WHY: the `?? runProcess` fallback only runs when the caller omits it.
    await mkdir(DIRECTORY, { recursive: true });
    await writeFile(SOURCE_PATH, 'full-video');
    ffmpegMocks.runProcess.mockImplementation(
      async (_binary: string, args: string[]) => {
        const output = args.at(-1);
        if (!output) throw new Error('missing output');
        await writeFile(output, 'teaser-default-runner');
        return { stdout: '', stderr: '' };
      },
    );

    const prepared = await prepareXTeaserVideo({
      episodeId: EPISODE_ID,
      sourcePath: SOURCE_PATH,
      durationSeconds: X_VIDEO_LIMIT_SECONDS + 100,
    });

    expect(prepared.reused).toBe(false);
    expect(ffmpegMocks.runProcess).toHaveBeenCalledOnce();
  });

  it('tolerates cleanup failure when teaser rendering fails', async () => {
    // WHY: the `catch (() => null)` on unlink only runs when cleanup itself fails.
    await mkdir(DIRECTORY, { recursive: true });
    await writeFile(SOURCE_PATH, 'full-video');
    ffmpegMocks.runProcess.mockRejectedValue(new Error('ffmpeg failed'));
    await expect(
      prepareXTeaserVideo({
        episodeId: `${EPISODE_ID}-cleanup-${Date.now()}`,
        sourcePath: SOURCE_PATH,
        durationSeconds: X_VIDEO_LIMIT_SECONDS + 100,
        ffmpegPath: '/test/ffmpeg',
        processRunner: ffmpegMocks.runProcess,
      }),
    ).rejects.toThrow('ffmpeg failed');
  });
});
