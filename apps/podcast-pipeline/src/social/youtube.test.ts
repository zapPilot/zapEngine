import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertYouTubeSessionReady: vi.fn(),
}));

vi.mock('./youtube-auth.js', () => ({
  assertYouTubeSessionReady: mocks.assertYouTubeSessionReady,
}));

import { createYouTubePublisher } from './youtube.js';

const directories: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertYouTubeSessionReady.mockResolvedValue({
    version: 1,
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 60_000,
    scope: 'https://www.googleapis.com/auth/youtube.upload',
  });
});

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('YouTube publisher', () => {
  it('creates a public zh-Hant resumable upload and returns the watch URL', async () => {
    const videoPath = await fixtureVideo();
    const requests: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input, init = {}) => {
      requests.push({ url: String(input), init });
      if (requests.length === 1) {
        return new Response(null, {
          status: 200,
          headers: { location: 'https://upload.example/session-1' },
        });
      }
      return new Response(JSON.stringify({ id: 'yt-video-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const publisher = createYouTubePublisher({
      fetchImpl,
      now: () => new Date('2026-08-16T00:00:00.000Z'),
    });

    const result = await publisher.publishYouTube({
      title: '市場更新',
      description: '今天的市場重點',
      videoPath,
      privacyStatus: 'public',
    });

    expect(result).toEqual({
      status: 'published',
      postId: 'yt-video-1',
      url: 'https://www.youtube.com/watch?v=yt-video-1',
      publishedAt: '2026-08-16T00:00:00.000Z',
    });
    expect(requests[0]?.url).toContain('uploadType=resumable');
    expect(requests[0]?.url).toContain('part=snippet%2Cstatus');
    const metadata = JSON.parse(String(requests[0]?.init.body)) as {
      snippet: Record<string, string>;
      status: Record<string, unknown>;
    };
    expect(metadata.snippet).toMatchObject({
      title: '市場更新',
      description: '今天的市場重點',
      defaultLanguage: 'zh-Hant',
      defaultAudioLanguage: 'zh-Hant',
    });
    expect(metadata.status).toMatchObject({
      privacyStatus: 'public',
      selfDeclaredMadeForKids: false,
    });
    expect(requests[1]?.url).toBe('https://upload.example/session-1');
  });

  it('names upload-session failures for recovery', async () => {
    const videoPath = await fixtureVideo();
    const publisher = createYouTubePublisher({
      fetchImpl: vi.fn<typeof fetch>(
        async () =>
          new Response(
            JSON.stringify({ error: { message: 'quota exceeded' } }),
            {
              status: 403,
              headers: { 'content-type': 'application/json' },
            },
          ),
      ),
    });

    await expect(
      publisher.publishYouTube({
        title: '市場更新',
        description: '今天的市場重點',
        videoPath,
        privacyStatus: 'public',
      }),
    ).rejects.toThrow(
      /YOUTUBE_PUBLISH_FAILED[\s\S]+Step: create_upload_session[\s\S]+quota exceeded/u,
    );
  });
});

async function fixtureVideo(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'zap-youtube-'));
  directories.push(directory);
  const path = join(directory, 'episode.mp4');
  await writeFile(path, Buffer.from('fake-mp4'));
  return path;
}
