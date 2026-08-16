import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  prepareSocialVideo,
  prepareXTeaserVideo,
  X_TEASER_CONTENT_SECONDS,
  X_VIDEO_LIMIT_SECONDS,
} from './video.js';

const EPISODE_ID = `video-stream-test-${process.pid}`;
const DIRECTORY = join(tmpdir(), 'zap-pilot-social');
const OUTPUT_PATH = join(DIRECTORY, `episode-${EPISODE_ID}-zh.mp4`);
const TEMPORARY_PATH = `${OUTPUT_PATH}.tmp-${process.pid}`;
const X_OUTPUT_PATH = join(DIRECTORY, `episode-${EPISODE_ID}-x-v1.mp4`);
const X_TEMPORARY_PATH = `${X_OUTPUT_PATH}.tmp-${process.pid}.mp4`;

async function fileExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

beforeEach(async () => {
  await mkdir(DIRECTORY, { recursive: true });
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all([
    unlink(OUTPUT_PATH).catch(() => undefined),
    unlink(TEMPORARY_PATH).catch(() => undefined),
    unlink(X_OUTPUT_PATH).catch(() => undefined),
    unlink(X_TEMPORARY_PATH).catch(() => undefined),
  ]);
});

describe('prepareSocialVideo', () => {
  it('streams the response body to an atomically renamed file', async () => {
    const response = new Response('streamed-video');
    const arrayBuffer = vi.spyOn(response, 'arrayBuffer');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const prepared = await prepareSocialVideo({
      episodeId: EPISODE_ID,
      url: 'https://media.example.com/video.mp4',
    });

    expect(prepared).toEqual({
      path: OUTPUT_PATH,
      sizeBytes: 14,
      reused: false,
    });
    expect(await readFile(OUTPUT_PATH, 'utf8')).toBe('streamed-video');
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(await fileExists(TEMPORARY_PATH)).toBe(false);
  });

  it('fails closed when a successful response has no body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null)));

    await expect(
      prepareSocialVideo({
        episodeId: EPISODE_ID,
        url: 'https://media.example.com/video.mp4',
      }),
    ).rejects.toThrow('Downloaded social video is empty.');
    expect(await fileExists(OUTPUT_PATH)).toBe(false);
  });

  it('removes a partial temporary file when streaming fails', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('partial'));
        controller.error(new Error('stream failed'));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(body, { status: 200 })),
    );

    await expect(
      prepareSocialVideo({
        episodeId: EPISODE_ID,
        url: 'https://media.example.com/video.mp4',
      }),
    ).rejects.toThrow('stream failed');
    expect(await fileExists(TEMPORARY_PATH)).toBe(false);
  });
});

describe('prepareXTeaserVideo', () => {
  it('reuses the source when it already fits the free X video limit', async () => {
    await writeFile(OUTPUT_PATH, 'short-video');
    const processRunner = vi.fn();

    await expect(
      prepareXTeaserVideo({
        episodeId: EPISODE_ID,
        sourcePath: OUTPUT_PATH,
        durationSeconds: X_VIDEO_LIMIT_SECONDS,
        processRunner,
      }),
    ).resolves.toEqual({
      path: OUTPUT_PATH,
      sizeBytes: 11,
      reused: true,
    });
    expect(processRunner).not.toHaveBeenCalled();
  });

  it('takes the first 130 seconds and preserves the existing final outro', async () => {
    await writeFile(OUTPUT_PATH, 'full-video');
    const processRunner = vi.fn(async (_binary: string, args: string[]) => {
      const output = args.at(-1);
      if (!output) throw new Error('missing output');
      await writeFile(output, 'teaser');
      return { stdout: '', stderr: '' };
    });

    const prepared = await prepareXTeaserVideo({
      episodeId: EPISODE_ID,
      sourcePath: OUTPUT_PATH,
      durationSeconds: 600,
      ffmpegPath: '/test/ffmpeg',
      processRunner,
    });

    expect(prepared).toEqual({
      path: X_OUTPUT_PATH,
      sizeBytes: 6,
      reused: false,
    });
    expect(processRunner).toHaveBeenCalledOnce();
    const [binary, args] = processRunner.mock.calls[0] ?? [];
    expect(binary).toBe('/test/ffmpeg');
    expect(args).toContain('-filter_complex');
    const filter = args?.[args.indexOf('-filter_complex') + 1] ?? '';
    expect(filter).toContain(`trim=start=0:end=${X_TEASER_CONTENT_SECONDS}`);
    expect(filter).toContain('trim=start=597.200');
    expect(filter).toContain('concat=n=2:v=1:a=1');
    expect(await readFile(X_OUTPUT_PATH, 'utf8')).toBe('teaser');
    expect(await fileExists(X_TEMPORARY_PATH)).toBe(false);
  });
});
