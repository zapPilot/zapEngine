import { readFile, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { prepareSocialVideo } from './video.js';

const EPISODE_ID = `video-stream-test-${process.pid}`;
const OUTPUT_PATH = join(
  tmpdir(),
  'zap-pilot-social',
  `episode-${EPISODE_ID}-zh.mp4`,
);
const TEMPORARY_PATH = `${OUTPUT_PATH}.tmp-${process.pid}`;

async function fileExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all([
    unlink(OUTPUT_PATH).catch(() => undefined),
    unlink(TEMPORARY_PATH).catch(() => undefined),
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
    expect(await fileExists(TEMPORARY_PATH)).toBe(false);
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
    expect(await fileExists(OUTPUT_PATH)).toBe(false);
    expect(await fileExists(TEMPORARY_PATH)).toBe(false);
  });
});
