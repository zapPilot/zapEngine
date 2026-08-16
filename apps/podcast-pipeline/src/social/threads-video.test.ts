import { createHash } from 'node:crypto';
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  prepareThreadsVideoUrl,
  THREADS_TEASER_SECONDS,
} from './threads-video.js';

const temporaryDirectories: string[] = [];
type UploadVideo = (input: { path: string; key: string }) => Promise<void>;

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function tempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'threads-video-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('prepareThreadsVideoUrl', () => {
  it('reuses an already prepared X teaser and publishes it under an immutable R2 key', async () => {
    const directory = await tempDirectory();
    const teaserPath = join(directory, 'x-teaser.mp4');
    await writeFile(teaserPath, 'video');
    const uploadVideo = vi.fn<UploadVideo>().mockResolvedValue(undefined);

    const url = await prepareThreadsVideoUrl(
      'https://media.example.com/episodes/episode-1/video.mp4',
      {
        preparedVideoPath: teaserPath,
        tempDir: directory,
        uploadVideo,
        publicBaseUrl: 'https://cdn.example.com/',
      },
    );

    expect(uploadVideo).toHaveBeenCalledTimes(1);
    const uploaded = uploadVideo.mock.calls[0]?.[0];
    expect(uploaded).toMatchObject({ path: teaserPath });
    expect(uploaded?.key).toMatch(
      /^social\/threads\/[a-f0-9]{24}\/v1\/video\.mp4$/,
    );
    expect(url).toBe(`https://cdn.example.com/${uploaded?.key}`);
  });

  it('downloads and renders a bounded teaser when Threads is published without X', async () => {
    const directory = await tempDirectory();
    const processRunner = vi.fn(async (_executable: string, args: string[]) => {
      const outputPath = args.at(-1);
      if (!outputPath) throw new Error('missing output path');
      await writeFile(outputPath, 'rendered');
      return { stdout: '', stderr: '' };
    });
    const uploadVideo = vi.fn<UploadVideo>().mockResolvedValue(undefined);
    const fetchImpl = vi.fn(
      async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );

    const first = await prepareThreadsVideoUrl(
      'https://media.example.com/episodes/episode-2/video.mp4',
      {
        tempDir: directory,
        fetchImpl,
        processRunner,
        ffmpegPath: '/fake/ffmpeg',
        uploadVideo,
        publicBaseUrl: 'https://cdn.example.com',
      },
    );
    const second = await prepareThreadsVideoUrl(
      'https://media.example.com/episodes/episode-2/video.mp4',
      {
        tempDir: directory,
        fetchImpl,
        processRunner,
        ffmpegPath: '/fake/ffmpeg',
        uploadVideo,
        publicBaseUrl: 'https://cdn.example.com',
      },
    );

    expect(first).toBe(second);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(processRunner).toHaveBeenCalledTimes(1);
    const args = processRunner.mock.calls[0]?.[1] ?? [];
    expect(args).toContain('-sseof');
    expect(args).toContain('-2.8');
    expect(args).toContain(String(THREADS_TEASER_SECONDS));
    expect(args.at(-1)).toMatch(/\.tmp-\d+\.mp4$/);
    expect(args.join(' ')).toContain('trim=start=0:end=130');
    expect(args.join(' ')).toContain('trim=start=0:end=2.8');
    expect(uploadVideo).toHaveBeenCalledTimes(2);
  });

  it('rejects non-HTTPS source URLs before touching the network', async () => {
    await expect(
      prepareThreadsVideoUrl('http://media.example.com/video.mp4', {
        publicBaseUrl: 'https://cdn.example.com',
        uploadVideo: async () => undefined,
      }),
    ).rejects.toThrow('valid public HTTPS URL');
  });

  it('rejects malformed source URLs before touching the network', async () => {
    await expect(
      prepareThreadsVideoUrl('not a url', {
        publicBaseUrl: 'https://cdn.example.com',
        uploadVideo: async () => undefined,
      }),
    ).rejects.toThrow('valid public HTTPS URL');
  });

  it('fails when a reused prepared teaser is missing or empty', async () => {
    const directory = await tempDirectory();
    const emptyPath = join(directory, 'empty.mp4');
    await writeFile(emptyPath, '');

    await expect(
      prepareThreadsVideoUrl(
        'https://media.example.com/episodes/episode-empty/video.mp4',
        {
          preparedVideoPath: emptyPath,
          tempDir: directory,
          uploadVideo: async () => undefined,
          publicBaseUrl: 'https://cdn.example.com',
        },
      ),
    ).rejects.toThrow('Threads teaser video is missing or empty');
  });

  it('reports source download failures before invoking ffmpeg', async () => {
    const directory = await tempDirectory();
    const processRunner = vi.fn();

    await expect(
      prepareThreadsVideoUrl(
        'https://media.example.com/episodes/episode-download/video.mp4',
        {
          tempDir: directory,
          fetchImpl: vi.fn(async () => new Response(null, { status: 502 })),
          processRunner,
          ffmpegPath: '/fake/ffmpeg',
          uploadVideo: async () => undefined,
          publicBaseUrl: 'https://cdn.example.com',
        },
      ),
    ).rejects.toThrow('Threads teaser source download failed: HTTP 502');

    expect(processRunner).not.toHaveBeenCalled();
  });

  it('fails closed and cleans up when ffmpeg produces no teaser output', async () => {
    const directory = await tempDirectory();
    const processRunner = vi.fn(async () => ({ stdout: '', stderr: '' }));

    await expect(
      prepareThreadsVideoUrl(
        'https://media.example.com/episodes/episode-render/video.mp4',
        {
          tempDir: directory,
          fetchImpl: vi.fn(
            async () =>
              new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
          ),
          processRunner,
          ffmpegPath: '/fake/ffmpeg',
          uploadVideo: async () => undefined,
          publicBaseUrl: 'https://cdn.example.com',
        },
      ),
    ).rejects.toThrow('Threads teaser video is missing or empty');

    expect(processRunner).toHaveBeenCalledOnce();
  });

  it('uses default temp/fetch/ffmpeg/public-base dependencies without invoking them when cached files exist', async () => {
    const sourceUrl = `https://media.example.com/defaults-${process.pid}.mp4`;
    const sourceHash = createHash('sha256')
      .update(sourceUrl)
      .digest('hex')
      .slice(0, 24);
    const directory = join(tmpdir(), 'zap-pilot-social');
    const sourcePath = join(directory, `threads-${sourceHash}-source.mp4`);
    const teaserPath = join(directory, `threads-${sourceHash}-v1.mp4`);
    await writeFile(sourcePath, 'source');
    await writeFile(teaserPath, 'teaser');
    vi.stubEnv('R2_PUBLIC_BASE_URL', 'https://cdn-default.example.com/');
    const uploadVideo = vi.fn<UploadVideo>().mockResolvedValue(undefined);

    try {
      const result = await prepareThreadsVideoUrl(sourceUrl, { uploadVideo });
      expect(result).toMatch(
        /^https:\/\/cdn-default\.example\.com\/social\/threads\/[^/]+\/v1\/video\.mp4$/,
      );
      expect(uploadVideo).toHaveBeenCalledWith(
        expect.objectContaining({ path: teaserPath }),
      );
    } finally {
      await Promise.all([
        unlink(sourcePath).catch(() => undefined),
        unlink(teaserPath).catch(() => undefined),
      ]);
    }
  });
});
