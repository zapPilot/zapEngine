import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
});
