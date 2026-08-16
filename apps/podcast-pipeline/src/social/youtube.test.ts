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

  it('fails the upload-session step when Google omits the resumable location', async () => {
    const videoPath = await fixtureVideo();
    const publisher = createYouTubePublisher({
      fetchImpl: vi.fn<typeof fetch>(
        async () => new Response(null, { status: 200 }),
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
      /YOUTUBE_PUBLISH_FAILED[\s\S]+Step: create_upload_session[\s\S]+did not return a resumable upload URL/u,
    );
  });

  it('names video-upload failures and preserves plain-text API errors', async () => {
    const videoPath = await fixtureVideo();
    const onLog = vi.fn();
    let requestCount = 0;
    const publisher = createYouTubePublisher({
      onLog,
      fetchImpl: vi.fn<typeof fetch>(async () => {
        requestCount += 1;
        if (requestCount === 1) {
          return new Response(null, {
            status: 200,
            headers: { location: 'https://upload.example/session-2' },
          });
        }
        return new Response('upstream upload failed', { status: 503 });
      }),
    });

    await expect(
      publisher.publishYouTube({
        title: '市場更新',
        description: '今天的市場重點',
        videoPath,
        privacyStatus: 'public',
      }),
    ).rejects.toThrow(
      /YOUTUBE_PUBLISH_FAILED[\s\S]+Step: upload_video[\s\S]+YouTube API 503: upstream upload failed/u,
    );
    expect(onLog).toHaveBeenCalledWith('[youtube] Uploading video');
  });

  it('rejects a successful upload response that has no video id', async () => {
    const videoPath = await fixtureVideo();
    let requestCount = 0;
    const publisher = createYouTubePublisher({
      fetchImpl: vi.fn<typeof fetch>(async () => {
        requestCount += 1;
        if (requestCount === 1) {
          return new Response(null, {
            status: 200,
            headers: { location: 'https://upload.example/session-3' },
          });
        }
        return new Response(JSON.stringify({ id: '   ' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    });

    await expect(
      publisher.publishYouTube({
        title: '市場更新',
        description: '今天的市場重點',
        videoPath,
        privacyStatus: 'public',
      }),
    ).rejects.toThrow(
      /YOUTUBE_PUBLISH_FAILED[\s\S]+Step: upload_video[\s\S]+did not include a video id/u,
    );
  });

  it('uses the generic HTTP failure when the API body is empty', async () => {
    const videoPath = await fixtureVideo();
    const publisher = createYouTubePublisher({
      fetchImpl: vi.fn<typeof fetch>(
        async () =>
          new Response(null, {
            status: 500,
          }),
      ),
    });

    await expect(
      publisher.publishYouTube({
        title: '市場更新',
        description: '今天的市場重點',
        videoPath,
        privacyStatus: 'public',
      }),
    ).rejects.toThrow('YouTube API request failed with HTTP 500');
  });
});

async function fixtureVideo(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'zap-youtube-'));
  directories.push(directory);
  const path = join(directory, 'episode.mp4');
  await writeFile(path, Buffer.from('fake-mp4'));
  return path;
}
