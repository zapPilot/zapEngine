import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  prepareSocialVideo,
  prepareXTeaserVideo,
  socialVideoCacheIdentity,
  xTeaserDurationSeconds,
  X_TEASER_CONTENT_SECONDS,
  X_VIDEO_LIMIT_SECONDS,
} from './video.js';

const EPISODE_ID = `video-stream-test-${process.pid}`;
const DIRECTORY = join(tmpdir(), 'zap-pilot-social');
const VIDEO_URL = 'https://media.example.com/video.mp4';
const SECOND_VIDEO_URL = 'https://media.example.com/video-v2.mp4';
const OUTPUT_PATH = join(
  DIRECTORY,
  `episode-${EPISODE_ID}-${socialVideoCacheIdentity(VIDEO_URL)}-zh.mp4`,
);
const SECOND_OUTPUT_PATH = join(
  DIRECTORY,
  `episode-${EPISODE_ID}-${socialVideoCacheIdentity(SECOND_VIDEO_URL)}-zh.mp4`,
);
const TEMPORARY_PATH = `${OUTPUT_PATH}.tmp-${process.pid}`;
const SECOND_TEMPORARY_PATH = `${SECOND_OUTPUT_PATH}.tmp-${process.pid}`;
const X_OUTPUT_PATH = join(
  DIRECTORY,
  `episode-${EPISODE_ID}-x-${socialVideoCacheIdentity(OUTPUT_PATH)}-v1.mp4`,
);
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
    unlink(SECOND_OUTPUT_PATH).catch(() => undefined),
    unlink(TEMPORARY_PATH).catch(() => undefined),
    unlink(SECOND_TEMPORARY_PATH).catch(() => undefined),
    unlink(X_OUTPUT_PATH).catch(() => undefined),
    unlink(X_TEMPORARY_PATH).catch(() => undefined),
  ]);
});

describe('video helpers', () => {
  it('computes teaser duration on both sides of the X limit and stable cache identities', () => {
    expect(xTeaserDurationSeconds(120)).toBe(120);
    expect(xTeaserDurationSeconds(X_VIDEO_LIMIT_SECONDS)).toBe(
      X_VIDEO_LIMIT_SECONDS,
    );
    expect(xTeaserDurationSeconds(600)).toBeCloseTo(132.8);
    expect(socialVideoCacheIdentity(VIDEO_URL)).toHaveLength(12);
    expect(socialVideoCacheIdentity(VIDEO_URL)).toBe(
      socialVideoCacheIdentity(VIDEO_URL),
    );
    expect(socialVideoCacheIdentity(VIDEO_URL)).not.toBe(
      socialVideoCacheIdentity(SECOND_VIDEO_URL),
    );
  });
});

describe('prepareSocialVideo', () => {
  it('reuses a non-empty cached download without touching the network', async () => {
    await writeFile(OUTPUT_PATH, 'cached-video');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      prepareSocialVideo({ episodeId: EPISODE_ID, url: VIDEO_URL }),
    ).resolves.toEqual({
      path: OUTPUT_PATH,
      sizeBytes: 12,
      reused: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('streams the response body to an atomically renamed source-keyed file', async () => {
    const response = new Response('streamed-video');
    const arrayBuffer = vi.spyOn(response, 'arrayBuffer');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const prepared = await prepareSocialVideo({
      episodeId: EPISODE_ID,
      url: VIDEO_URL,
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

  it('uses a new cache entry when the canonical video URL changes', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('first-video'))
        .mockResolvedValueOnce(new Response('second-video')),
    );

    const first = await prepareSocialVideo({
      episodeId: EPISODE_ID,
      url: VIDEO_URL,
    });
    const second = await prepareSocialVideo({
      episodeId: EPISODE_ID,
      url: SECOND_VIDEO_URL,
    });

    expect(first.path).not.toBe(second.path);
    expect(second.path).toBe(SECOND_OUTPUT_PATH);
    expect(await readFile(SECOND_OUTPUT_PATH, 'utf8')).toBe('second-video');
  });

  it('rejects unsuccessful downloads with status context', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('nope', {
          status: 503,
          statusText: 'Service Unavailable',
        }),
      ),
    );

    await expect(
      prepareSocialVideo({ episodeId: EPISODE_ID, url: VIDEO_URL }),
    ).rejects.toThrow('503 Service Unavailable');
  });

  it('replaces an empty cache entry and sanitizes unsafe episode ids', async () => {
    await writeFile(OUTPUT_PATH, '');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('replacement')));
    const prepared = await prepareSocialVideo({
      episodeId: `${EPISODE_ID}/unsafe:id`,
      url: VIDEO_URL,
    });
    expect(prepared.path).toContain('unsafe_id');
    await unlink(prepared.path).catch(() => undefined);
  });

  it('fails closed when a successful response has no body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null)));

    await expect(
      prepareSocialVideo({
        episodeId: EPISODE_ID,
        url: VIDEO_URL,
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
        url: VIDEO_URL,
      }),
    ).rejects.toThrow('stream failed');
    expect(await fileExists(TEMPORARY_PATH)).toBe(false);
  });
});

describe('prepareXTeaserVideo', () => {
  it('rejects directories and empty files as teaser sources', async () => {
    await expect(
      prepareXTeaserVideo({
        episodeId: EPISODE_ID,
        sourcePath: DIRECTORY,
        durationSeconds: 600,
        processRunner: vi.fn(),
      }),
    ).rejects.toThrow('missing or empty');

    await writeFile(OUTPUT_PATH, '');
    await expect(
      prepareXTeaserVideo({
        episodeId: EPISODE_ID,
        sourcePath: OUTPUT_PATH,
        durationSeconds: 600,
        processRunner: vi.fn(),
      }),
    ).rejects.toThrow('missing or empty');
  });

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

  it('reuses an existing non-empty teaser cache for long videos', async () => {
    await writeFile(OUTPUT_PATH, 'full-video');
    await writeFile(X_OUTPUT_PATH, 'cached-teaser');
    const processRunner = vi.fn();

    await expect(
      prepareXTeaserVideo({
        episodeId: EPISODE_ID,
        sourcePath: OUTPUT_PATH,
        durationSeconds: 600,
        processRunner,
      }),
    ).resolves.toEqual({
      path: X_OUTPUT_PATH,
      sizeBytes: 13,
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

  it('uses the resolved ffmpeg path when no override is supplied', async () => {
    await writeFile(OUTPUT_PATH, 'full-video');
    const processRunner = vi.fn(async (_binary: string, args: string[]) => {
      await writeFile(args.at(-1)!, 'teaser');
      return { stdout: '', stderr: '' };
    });

    await prepareXTeaserVideo({
      episodeId: EPISODE_ID,
      sourcePath: OUTPUT_PATH,
      durationSeconds: 600,
      processRunner,
    });
    expect(processRunner.mock.calls[0]?.[0]).toEqual(expect.any(String));
  });

  it('removes empty or partial teaser output when rendering fails', async () => {
    await writeFile(OUTPUT_PATH, 'full-video');
    await expect(
      prepareXTeaserVideo({
        episodeId: EPISODE_ID,
        sourcePath: OUTPUT_PATH,
        durationSeconds: 600,
        ffmpegPath: '/test/ffmpeg',
        processRunner: async (_binary, args) => {
          await writeFile(args.at(-1)!, '');
          return { stdout: '', stderr: '' };
        },
      }),
    ).rejects.toThrow('Rendered X teaser video is empty');
    expect(await fileExists(X_TEMPORARY_PATH)).toBe(false);

    await expect(
      prepareXTeaserVideo({
        episodeId: EPISODE_ID,
        sourcePath: OUTPUT_PATH,
        durationSeconds: 600,
        ffmpegPath: '/test/ffmpeg',
        processRunner: async (_binary, args) => {
          await writeFile(args.at(-1)!, 'partial');
          throw new Error('ffmpeg failed');
        },
      }),
    ).rejects.toThrow('ffmpeg failed');
    expect(await fileExists(X_TEMPORARY_PATH)).toBe(false);
  });
});
