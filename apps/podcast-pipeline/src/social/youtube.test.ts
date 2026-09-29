import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertYouTubeSessionReady: vi.fn(),
}));

vi.mock('./youtube-auth.js', () => ({
  assertYouTubeSessionReady: mocks.assertYouTubeSessionReady,
  YOUTUBE_ANALYTICS_SCOPE:
    'https://www.googleapis.com/auth/yt-analytics.readonly',
}));

import { assertYouTubeChannel, createYouTubePublisher } from './youtube.js';

const ANALYTICS_URL = 'https://youtubeanalytics.googleapis.com/v2/reports';
const THUMBNAIL_API_URL =
  'https://www.googleapis.com/upload/youtube/v3/thumbnails/set';
const THUMBNAIL_URL = 'https://cdn.example.com/canonical-thumbnail.png';
const CHANNEL_ID = 'UC-zap-nomad';
const directories: string[] = [];

/**
 * Every upload proves the channel first, so the transport assertions below stay
 * written against the upload calls alone.
 */
function withChannelProbe(fetchImpl: typeof fetch): typeof fetch {
  return vi.fn<typeof fetch>(async (input, init) => {
    if (String(input).startsWith(ANALYTICS_URL)) {
      return new Response(JSON.stringify({ rows: [[0]] }), { status: 200 });
    }
    return fetchImpl(input, init);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('YOUTUBE_CHANNEL_ID', CHANNEL_ID);
  mocks.assertYouTubeSessionReady.mockResolvedValue({
    version: 1,
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 60_000,
    scope: 'https://www.googleapis.com/auth/youtube.upload',
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('YouTube publisher', () => {
  it('uses the default clock and global fetch when asserting the expected channel directly', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ rows: [[0]] }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchImpl);

    await expect(
      assertYouTubeChannel({ accessToken: 'access-token' }),
    ).resolves.toBe(CHANNEL_ID);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const requestUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get('startDate')).toMatch(
      /^\d{4}-\d{2}-\d{2}$/u,
    );
  });

  it('uses the generic API error when Google returns an error object without a message', async () => {
    await expect(
      assertYouTubeChannel({
        accessToken: 'access-token',
        now: () => new Date('2026-09-29T00:00:00.000Z'),
        fetchImpl: async () =>
          new Response(JSON.stringify({ error: {} }), { status: 403 }),
      }),
    ).rejects.toThrow('YouTube API request failed with HTTP 403');
  });

  it('rejects an empty canonical thumbnail response before opening an upload session', async () => {
    const videoPath = await fixtureVideo();
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (String(input) === THUMBNAIL_URL) {
        return new Response(new Uint8Array(), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    const publisher = createYouTubePublisher({
      fetchImpl: withChannelProbe(fetchImpl),
    });

    await expect(
      publisher.publishYouTube({
        title: '市場更新',
        description: '今天的市場重點',
        videoPath,
        thumbnailUrl: THUMBNAIL_URL,
        privacyStatus: 'public',
      }),
    ).rejects.toThrow(/thumbnail download returned an empty body/u);
  });

  it('accepts a JPEG thumbnail with no content-type as an octet-stream without re-encoding it', async () => {
    const videoPath = await fixtureVideo();
    const thumbnailBytes = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: '#123456',
      },
    })
      .jpeg()
      .toBuffer();
    const requests: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input, init = {}) => {
      const url = String(input);
      requests.push({ url, init });
      if (url === THUMBNAIL_URL) {
        return new Response(new Uint8Array(thumbnailBytes), { status: 200 });
      }
      if (url.includes('/upload/youtube/v3/videos')) {
        return new Response(null, {
          status: 200,
          headers: { location: 'https://upload.example/octet-session' },
        });
      }
      if (url === 'https://upload.example/octet-session') {
        return new Response(JSON.stringify({ id: 'yt-octet' }), {
          status: 200,
        });
      }
      if (url.startsWith(THUMBNAIL_API_URL)) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const publisher = createYouTubePublisher({
      fetchImpl: withChannelProbe(fetchImpl),
    });

    await publisher.publishYouTube({
      title: '市場更新',
      description: '今天的市場重點',
      videoPath,
      thumbnailUrl: THUMBNAIL_URL,
      privacyStatus: 'public',
    });

    const thumbnailRequest = requests.find((request) =>
      request.url.startsWith(THUMBNAIL_API_URL),
    );
    expect(
      new Headers(thumbnailRequest?.init.headers).get('content-type'),
    ).toBe('application/octet-stream');
    expect(
      Buffer.from(thumbnailRequest?.init.body as Uint8Array).equals(
        thumbnailBytes,
      ),
    ).toBe(true);
  });

  it('accepts both PNG octet-stream and JPEG image/jpeg content-type matches without re-encoding', async () => {
    const cases = [
      {
        name: 'png-octet',
        bytes: await fixtureThumbnailPng(),
        contentType: undefined,
        expectedType: 'application/octet-stream',
      },
      {
        name: 'jpeg-exact',
        bytes: await sharp({
          create: {
            width: 64,
            height: 64,
            channels: 3,
            background: '#123456',
          },
        })
          .jpeg()
          .toBuffer(),
        contentType: 'image/jpeg',
        expectedType: 'image/jpeg',
      },
    ] as const;

    for (const testCase of cases) {
      const videoPath = await fixtureVideo();
      const thumbnailRequests: RequestInit[] = [];
      const fetchImpl = vi.fn<typeof fetch>(async (input, init = {}) => {
        const url = String(input);
        if (url === THUMBNAIL_URL) {
          return new Response(new Uint8Array(testCase.bytes), {
            status: 200,
            ...(testCase.contentType
              ? { headers: { 'content-type': testCase.contentType } }
              : {}),
          });
        }
        if (url.includes('/upload/youtube/v3/videos')) {
          return new Response(null, {
            status: 200,
            headers: {
              location: `https://upload.example/${testCase.name}-session`,
            },
          });
        }
        if (url === `https://upload.example/${testCase.name}-session`) {
          return new Response(JSON.stringify({ id: `yt-${testCase.name}` }), {
            status: 200,
          });
        }
        if (url.startsWith(THUMBNAIL_API_URL)) {
          thumbnailRequests.push(init);
          return new Response(JSON.stringify({ items: [] }), { status: 200 });
        }
        throw new Error(`Unexpected request: ${url}`);
      });

      await createYouTubePublisher({
        fetchImpl: withChannelProbe(fetchImpl),
      }).publishYouTube({
        title: '市場更新',
        description: '今天的市場重點',
        videoPath,
        thumbnailUrl: THUMBNAIL_URL,
        privacyStatus: 'public',
      });

      expect(
        new Headers(thumbnailRequests[0]?.headers).get('content-type'),
      ).toBe(testCase.expectedType);
      expect(
        Buffer.from(thumbnailRequests[0]?.body as Uint8Array).equals(
          testCase.bytes,
        ),
      ).toBe(true);
    }
  });

  it('fails when the 720px fallback JPEG still exceeds YouTube thumbnail limits', async () => {
    const videoPath = await fixtureVideo();
    const width = 100;
    const height = 30_000;
    const thumbnailBytes = await sharp(randomBytes(width * height * 3), {
      raw: { width, height, channels: 3 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (String(input) === THUMBNAIL_URL) {
        return new Response(new Uint8Array(thumbnailBytes), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    const publisher = createYouTubePublisher({
      fetchImpl: withChannelProbe(fetchImpl),
    });

    await expect(
      publisher.publishYouTube({
        title: '市場更新',
        description: '今天的市場重點',
        videoPath,
        thumbnailUrl: THUMBNAIL_URL,
        privacyStatus: 'public',
      }),
    ).rejects.toThrow(/remains \d+ bytes after compression/u);
  });

  it('handles an upload stream that the fetch implementation fully closes before returning', async () => {
    const videoPath = await fixtureVideo();
    const thumbnailBytes = await fixtureThumbnailPng();
    const fetchImpl = vi.fn<typeof fetch>(async (input, init = {}) => {
      const url = String(input);
      if (url === THUMBNAIL_URL) {
        return new Response(new Uint8Array(thumbnailBytes), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      if (url.includes('/upload/youtube/v3/videos')) {
        return new Response(null, {
          status: 200,
          headers: { location: 'https://upload.example/closed-session' },
        });
      }
      if (url === 'https://upload.example/closed-session') {
        const body = init.body as unknown as NodeJS.ReadableStream & {
          closed: boolean;
        };
        for await (const chunk of body) {
          // Consume the stream exactly as a real fetch implementation would.
          expect(chunk).toBeDefined();
        }
        expect(body.closed).toBe(true);
        return new Response(JSON.stringify({ id: 'yt-closed' }), {
          status: 200,
        });
      }
      if (url.startsWith(THUMBNAIL_API_URL)) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const publisher = createYouTubePublisher({
      fetchImpl: withChannelProbe(fetchImpl),
    });

    await expect(
      publisher.publishYouTube({
        title: '市場更新',
        description: '今天的市場重點',
        videoPath,
        thumbnailUrl: THUMBNAIL_URL,
        privacyStatus: 'public',
      }),
    ).resolves.toMatchObject({ postId: 'yt-closed' });
  });

  it('rejects invalid title length before creating an upload session', async () => {
    const videoPath = await fixtureVideo();
    const thumbnailBytes = await fixtureThumbnailPng();
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === THUMBNAIL_URL) {
        return new Response(new Uint8Array(thumbnailBytes), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const publisher = createYouTubePublisher({
      fetchImpl: withChannelProbe(fetchImpl),
    });

    await expect(
      publisher.publishYouTube({
        title: 'A'.repeat(101),
        description: 'Description',
        videoPath,
        thumbnailUrl: THUMBNAIL_URL,
        privacyStatus: 'public',
      }),
    ).rejects.toThrow(
      /Step: create_upload_session[\s\S]+YouTube title must contain 1-100 characters; received 101/u,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses global fetch and the real clock when no options are injected', async () => {
    const videoPath = await fixtureVideo();
    const thumbnailBytes = await fixtureThumbnailPng();
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === THUMBNAIL_URL) {
        return new Response(new Uint8Array(thumbnailBytes), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      if (url.includes('/upload/youtube/v3/videos')) {
        return new Response(null, {
          status: 200,
          headers: { location: 'https://upload.example/default-session' },
        });
      }
      if (url === 'https://upload.example/default-session') {
        return new Response(JSON.stringify({ id: 'yt-default' }), {
          status: 200,
        });
      }
      if (url.startsWith(THUMBNAIL_API_URL)) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', withChannelProbe(fetchImpl));
    const publisher = createYouTubePublisher();

    const result = await publisher.publishYouTube({
      title: '市場更新',
      description: '今天的市場重點',
      videoPath,
      thumbnailUrl: THUMBNAIL_URL,
      privacyStatus: 'public',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(result.postId).toBe('yt-default');
    expect(Number.isNaN(Date.parse(result.publishedAt))).toBe(false);
  });

  it('creates a public zh-Hant resumable upload and returns the watch URL', async () => {
    const videoPath = await fixtureVideo();
    const thumbnailBytes = await fixtureThumbnailPng();
    const requests: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input, init = {}) => {
      const url = String(input);
      requests.push({ url, init });
      if (url === THUMBNAIL_URL) {
        return new Response(new Uint8Array(thumbnailBytes), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      if (url.startsWith(THUMBNAIL_API_URL)) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      if (url.includes('/upload/youtube/v3/videos')) {
        return new Response(null, {
          status: 200,
          headers: { location: 'https://upload.example/session-1' },
        });
      }
      if (url === 'https://upload.example/session-1') {
        return new Response(JSON.stringify({ id: 'yt-video-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const publisher = createYouTubePublisher({
      fetchImpl: withChannelProbe(fetchImpl),
      now: () => new Date('2026-08-16T00:00:00.000Z'),
    });

    const result = await publisher.publishYouTube({
      title: '市場更新',
      description: '今天的市場重點',
      videoPath,
      thumbnailUrl: THUMBNAIL_URL,
      privacyStatus: 'public',
    });

    expect(result).toEqual({
      status: 'published',
      postId: 'yt-video-1',
      url: 'https://www.youtube.com/watch?v=yt-video-1',
      publishedAt: '2026-08-16T00:00:00.000Z',
    });
    // requests[0] is thumbnail fetch, requests[1] is resumable session, requests[2] is upload
    expect(requests[1]?.url).toContain('uploadType=resumable');
    expect(requests[1]?.url).toContain('part=snippet%2Cstatus');
    const metadata = JSON.parse(String(requests[1]?.init.body)) as {
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
    expect(requests[2]?.url).toBe('https://upload.example/session-1');
  });

  it('sets the canonical renderer poster as the uploaded video thumbnail', async () => {
    const videoPath = await fixtureVideo();
    const onLog = vi.fn();
    const requests: { url: string; init: RequestInit }[] = [];
    const thumbnailBytes = await fixtureThumbnailPng();
    const fetchImpl = vi.fn<typeof fetch>(async (input, init = {}) => {
      const url = String(input);
      requests.push({ url, init });
      if (url === THUMBNAIL_URL) {
        return new Response(new Uint8Array(thumbnailBytes), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      if (url.includes('/upload/youtube/v3/videos')) {
        return new Response(null, {
          status: 200,
          headers: { location: 'https://upload.example/thumbnail-session' },
        });
      }
      if (url === 'https://upload.example/thumbnail-session') {
        return new Response(JSON.stringify({ id: 'yt-thumbnail' }), {
          status: 200,
        });
      }
      if (url.startsWith(THUMBNAIL_API_URL)) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const publisher = createYouTubePublisher({
      fetchImpl: withChannelProbe(fetchImpl),
      onLog,
      now: () => new Date('2026-08-16T00:00:00.000Z'),
    });

    const result = await publisher.publishYouTube({
      title: '市場更新',
      description: '今天的市場重點',
      videoPath,
      thumbnailUrl: THUMBNAIL_URL,
      privacyStatus: 'public',
    });

    expect(result.postId).toBe('yt-thumbnail');
    expect(requests[0]?.url).toBe(THUMBNAIL_URL);
    const thumbnailRequest = requests[3];
    expect(thumbnailRequest?.url).toContain(THUMBNAIL_API_URL);
    const thumbnailUploadUrl = new URL(thumbnailRequest?.url ?? '');
    expect(thumbnailUploadUrl.searchParams.get('videoId')).toBe('yt-thumbnail');
    expect(thumbnailUploadUrl.searchParams.get('uploadType')).toBe('media');
    expect(thumbnailRequest?.init.method).toBe('POST');
    expect(
      new Headers(thumbnailRequest?.init.headers).get('content-type'),
    ).toBe('image/png');
    expect(
      Buffer.from(thumbnailRequest?.init.body as Uint8Array).equals(
        thumbnailBytes,
      ),
    ).toBe(true);
    expect(onLog).toHaveBeenCalledWith(
      '[youtube] Preparing canonical thumbnail',
    );
    expect(onLog).toHaveBeenCalledWith('[youtube] Setting canonical thumbnail');
  });

  it('rejects corrupt canonical image bytes before uploading a video', async () => {
    const videoPath = await fixtureVideo();
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (String(input) === THUMBNAIL_URL) {
        return new Response(new Uint8Array(Buffer.from('not-an-image')), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    const publisher = createYouTubePublisher({
      fetchImpl: withChannelProbe(fetchImpl),
    });

    await expect(
      publisher.publishYouTube({
        title: '市場更新',
        description: '今天的市場重點',
        videoPath,
        thumbnailUrl: THUMBNAIL_URL,
        privacyStatus: 'public',
      }),
    ).rejects.toThrow(
      /YOUTUBE_PUBLISH_FAILED[\s\S]+Step: prepare_thumbnail[\s\S]+not a decodable image/u,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-encodes a supported image delivered with an unsupported MIME type', async () => {
    const videoPath = await fixtureVideo();
    const requests: { url: string; init: RequestInit }[] = [];
    const thumbnailBytes = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: '#123456',
      },
    })
      .webp()
      .toBuffer();
    const fetchImpl = vi.fn<typeof fetch>(async (input, init = {}) => {
      const url = String(input);
      requests.push({ url, init });
      if (url === THUMBNAIL_URL) {
        return new Response(new Uint8Array(thumbnailBytes), {
          status: 200,
          headers: { 'content-type': 'image/webp' },
        });
      }
      if (url.includes('/upload/youtube/v3/videos')) {
        return new Response(null, {
          status: 200,
          headers: { location: 'https://upload.example/webp-session' },
        });
      }
      if (url === 'https://upload.example/webp-session') {
        return new Response(JSON.stringify({ id: 'yt-webp' }), { status: 200 });
      }
      if (url.startsWith(THUMBNAIL_API_URL)) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const publisher = createYouTubePublisher({
      fetchImpl: withChannelProbe(fetchImpl),
    });

    await publisher.publishYouTube({
      title: '市場更新',
      description: '今天的市場重點',
      videoPath,
      thumbnailUrl: THUMBNAIL_URL,
      privacyStatus: 'public',
    });

    const thumbnailRequest = requests[3];
    expect(
      new Headers(thumbnailRequest?.init.headers).get('content-type'),
    ).toBe('image/jpeg');
    const uploaded = Buffer.from(thumbnailRequest?.init.body as Uint8Array);
    expect((await sharp(uploaded).metadata()).format).toBe('jpeg');
  });

  it('downsizes a noisy oversized poster to the bounded 720px JPEG fallback', async () => {
    const videoPath = await fixtureVideo();
    const requests: { url: string; init: RequestInit }[] = [];
    const width = 1_600;
    const height = 1_600;
    const thumbnailBytes = await sharp(randomBytes(width * height * 3), {
      raw: { width, height, channels: 3 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    expect(thumbnailBytes.length).toBeGreaterThan(2 * 1024 * 1024);
    const fetchImpl = vi.fn<typeof fetch>(async (input, init = {}) => {
      const url = String(input);
      requests.push({ url, init });
      if (url === THUMBNAIL_URL) {
        return new Response(new Uint8Array(thumbnailBytes), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      if (url.includes('/upload/youtube/v3/videos')) {
        return new Response(null, {
          status: 200,
          headers: { location: 'https://upload.example/large-session' },
        });
      }
      if (url === 'https://upload.example/large-session') {
        return new Response(JSON.stringify({ id: 'yt-large' }), {
          status: 200,
        });
      }
      if (url.startsWith(THUMBNAIL_API_URL)) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const publisher = createYouTubePublisher({
      fetchImpl: withChannelProbe(fetchImpl),
    });

    await publisher.publishYouTube({
      title: '市場更新',
      description: '今天的市場重點',
      videoPath,
      thumbnailUrl: THUMBNAIL_URL,
      privacyStatus: 'public',
    });

    const thumbnailRequest = requests[3];
    const uploaded = Buffer.from(thumbnailRequest?.init.body as Uint8Array);
    expect(uploaded.length).toBeLessThanOrEqual(2 * 1024 * 1024);
    const metadata = await sharp(uploaded).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(720);
  });

  it('keeps an already-published video successful when thumbnail setting fails', async () => {
    const videoPath = await fixtureVideo();
    const onLog = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === THUMBNAIL_URL) {
        return new Response(new Uint8Array(await fixtureThumbnailPng()), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      if (url.includes('/upload/youtube/v3/videos')) {
        return new Response(null, {
          status: 200,
          headers: { location: 'https://upload.example/warning-session' },
        });
      }
      if (url === 'https://upload.example/warning-session') {
        return new Response(JSON.stringify({ id: 'yt-warning' }), {
          status: 200,
        });
      }
      if (url.startsWith(THUMBNAIL_API_URL)) {
        return new Response(
          JSON.stringify({ error: { message: 'thumbnail forbidden' } }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const publisher = createYouTubePublisher({
      fetchImpl: withChannelProbe(fetchImpl),
      onLog,
    });

    const result = await publisher.publishYouTube({
      title: '市場更新',
      description: '今天的市場重點',
      videoPath,
      thumbnailUrl: THUMBNAIL_URL,
      privacyStatus: 'public',
    });

    expect(result.postId).toBe('yt-warning');
    expect(result.warnings).toEqual([
      expect.stringContaining(
        'video yt-warning published but canonical thumbnail was not set',
      ),
    ]);
    expect(onLog).toHaveBeenCalledWith(
      expect.stringContaining(
        'WARNING: video yt-warning published but canonical thumbnail was not set',
      ),
    );
  });

  it('names thumbnail preparation failures before uploading a video', async () => {
    const videoPath = await fixtureVideo();
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (String(input) === THUMBNAIL_URL) {
        return new Response(null, { status: 404 });
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    const publisher = createYouTubePublisher({
      fetchImpl: withChannelProbe(fetchImpl),
    });

    await expect(
      publisher.publishYouTube({
        title: '市場更新',
        description: '今天的市場重點',
        videoPath,
        thumbnailUrl: THUMBNAIL_URL,
        privacyStatus: 'public',
      }),
    ).rejects.toThrow(
      /YOUTUBE_PUBLISH_FAILED[\s\S]+Step: prepare_thumbnail[\s\S]+HTTP 404/u,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('names upload-session failures for recovery', async () => {
    const videoPath = await fixtureVideo();
    const thumbnailBytes = await fixtureThumbnailPng();
    const publisher = createYouTubePublisher({
      fetchImpl: withChannelProbe(
        vi.fn<typeof fetch>(async (input) => {
          const url = String(input);
          if (url === THUMBNAIL_URL) {
            return new Response(new Uint8Array(thumbnailBytes), {
              status: 200,
              headers: { 'content-type': 'image/png' },
            });
          }
          return new Response(
            JSON.stringify({ error: { message: 'quota exceeded' } }),
            {
              status: 403,
              headers: { 'content-type': 'application/json' },
            },
          );
        }),
      ),
    });

    await expect(
      publisher.publishYouTube({
        title: '市場更新',
        description: '今天的市場重點',
        videoPath,
        thumbnailUrl: THUMBNAIL_URL,
        privacyStatus: 'public',
      }),
    ).rejects.toThrow(
      /YOUTUBE_PUBLISH_FAILED[\s\S]+Step: create_upload_session[\s\S]+quota exceeded/u,
    );
  });

  it('fails the upload-session step when Google omits the resumable location', async () => {
    const videoPath = await fixtureVideo();
    const thumbnailBytes = await fixtureThumbnailPng();
    const publisher = createYouTubePublisher({
      fetchImpl: withChannelProbe(
        vi.fn<typeof fetch>(async (input) => {
          const url = String(input);
          if (url === THUMBNAIL_URL) {
            return new Response(new Uint8Array(thumbnailBytes), {
              status: 200,
              headers: { 'content-type': 'image/png' },
            });
          }
          return new Response(null, { status: 200 });
        }),
      ),
    });

    await expect(
      publisher.publishYouTube({
        title: '市場更新',
        description: '今天的市場重點',
        videoPath,
        thumbnailUrl: THUMBNAIL_URL,
        privacyStatus: 'public',
      }),
    ).rejects.toThrow(
      /YOUTUBE_PUBLISH_FAILED[\s\S]+Step: create_upload_session[\s\S]+did not return a resumable upload URL/u,
    );
  });

  it('names video-upload failures and preserves plain-text API errors', async () => {
    const videoPath = await fixtureVideo();
    const onLog = vi.fn();
    const thumbnailBytes = await fixtureThumbnailPng();
    let requestCount = 0;
    const publisher = createYouTubePublisher({
      onLog,
      fetchImpl: withChannelProbe(
        vi.fn<typeof fetch>(async (input) => {
          const url = String(input);
          if (url === THUMBNAIL_URL) {
            return new Response(new Uint8Array(thumbnailBytes), {
              status: 200,
              headers: { 'content-type': 'image/png' },
            });
          }
          requestCount += 1;
          if (requestCount === 1) {
            return new Response(null, {
              status: 200,
              headers: { location: 'https://upload.example/session-2' },
            });
          }
          return new Response('upstream upload failed', { status: 503 });
        }),
      ),
    });

    await expect(
      publisher.publishYouTube({
        title: '市場更新',
        description: '今天的市場重點',
        videoPath,
        thumbnailUrl: THUMBNAIL_URL,
        privacyStatus: 'public',
      }),
    ).rejects.toThrow(
      /YOUTUBE_PUBLISH_FAILED[\s\S]+Step: upload_video[\s\S]+YouTube API 503: upstream upload failed/u,
    );
    expect(onLog).toHaveBeenCalledWith('[youtube] Uploading video');
  });

  it('rejects a successful upload response that has no video id', async () => {
    const videoPath = await fixtureVideo();
    const thumbnailBytes = await fixtureThumbnailPng();
    let requestCount = 0;
    const publisher = createYouTubePublisher({
      fetchImpl: withChannelProbe(
        vi.fn<typeof fetch>(async (input) => {
          const url = String(input);
          if (url === THUMBNAIL_URL) {
            return new Response(new Uint8Array(thumbnailBytes), {
              status: 200,
              headers: { 'content-type': 'image/png' },
            });
          }
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
      ),
    });

    await expect(
      publisher.publishYouTube({
        title: '市場更新',
        description: '今天的市場重點',
        videoPath,
        thumbnailUrl: THUMBNAIL_URL,
        privacyStatus: 'public',
      }),
    ).rejects.toThrow(
      /YOUTUBE_PUBLISH_FAILED[\s\S]+Step: upload_video[\s\S]+did not include a video id/u,
    );
  });

  it('uses the generic HTTP failure for valid JSON that has no structured error', async () => {
    const videoPath = await fixtureVideo();
    const thumbnailBytes = await fixtureThumbnailPng();
    let call = 0;
    const publisher = createYouTubePublisher({
      fetchImpl: withChannelProbe(
        vi.fn<typeof fetch>(async (input) => {
          const url = String(input);
          if (url === THUMBNAIL_URL) {
            return new Response(new Uint8Array(thumbnailBytes), {
              status: 200,
              headers: { 'content-type': 'image/png' },
            });
          }
          call += 1;
          if (call === 1) {
            return new Response('null', { status: 500 });
          }
          throw new Error(`Unexpected call ${call} for ${url}`);
        }),
      ),
    });

    await expect(
      publisher.publishYouTube({
        title: '市場更新',
        description: '今天的市場重點',
        videoPath,
        thumbnailUrl: THUMBNAIL_URL,
        privacyStatus: 'public',
      }),
    ).rejects.toThrow('YouTube API request failed with HTTP 500');
  });

  it('uses the generic HTTP failure when the API body is empty', async () => {
    const videoPath = await fixtureVideo();
    const thumbnailBytes = await fixtureThumbnailPng();
    let call = 0;
    const publisher = createYouTubePublisher({
      fetchImpl: withChannelProbe(
        vi.fn<typeof fetch>(async (input) => {
          const url = String(input);
          if (url === THUMBNAIL_URL) {
            return new Response(new Uint8Array(thumbnailBytes), {
              status: 200,
              headers: { 'content-type': 'image/png' },
            });
          }
          call += 1;
          if (call === 1) {
            return new Response(null, { status: 500 });
          }
          throw new Error(`Unexpected call ${call}`);
        }),
      ),
    });

    await expect(
      publisher.publishYouTube({
        title: '市場更新',
        description: '今天的市場重點',
        videoPath,
        thumbnailUrl: THUMBNAIL_URL,
        privacyStatus: 'public',
      }),
    ).rejects.toThrow('YouTube API request failed with HTTP 500');
  });
});

describe('YouTube channel guard', () => {
  it('proves the expected channel with the analytics scope before uploading', async () => {
    const videoPath = await fixtureVideo();
    const onLog = vi.fn();
    const captureRequests: string[] = [];
    const thumbnailBytes = await fixtureThumbnailPng();
    const deterministicFetch = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      captureRequests.push(url);
      if (url.startsWith(ANALYTICS_URL)) {
        return new Response(JSON.stringify({ rows: [[0]] }), { status: 200 });
      }
      if (url === THUMBNAIL_URL) {
        return new Response(new Uint8Array(thumbnailBytes), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      if (url.includes('/upload/youtube/v3/videos')) {
        return new Response(null, {
          status: 200,
          headers: { location: 'https://upload.example/session-guard' },
        });
      }
      if (url === 'https://upload.example/session-guard') {
        return new Response(JSON.stringify({ id: 'yt-guarded' }), {
          status: 200,
        });
      }
      if (url.startsWith(THUMBNAIL_API_URL)) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      throw new Error(`Unexpected ${url}`);
    });
    const publisher = createYouTubePublisher({
      fetchImpl: deterministicFetch,
      onLog,
      now: () => new Date('2026-08-16T00:00:00.000Z'),
    });

    const result = await publisher.publishYouTube({
      title: '市場更新',
      description: '今天的市場重點',
      videoPath,
      thumbnailUrl: THUMBNAIL_URL,
      privacyStatus: 'unlisted',
    });

    expect(result.postId).toBe('yt-guarded');
    const probe = new URL(captureRequests[0] ?? '');
    expect(probe.origin + probe.pathname).toBe(ANALYTICS_URL);
    expect(probe.searchParams.get('ids')).toBe(`channel==${CHANNEL_ID}`);
    expect(probe.searchParams.get('metrics')).toBe('views');
    expect(probe.searchParams.get('startDate')).toBe('2026-08-16');
    expect(probe.searchParams.get('endDate')).toBe('2026-08-16');
    expect(captureRequests[2]).toContain('uploadType=resumable');
    expect(onLog).toHaveBeenCalledWith(
      `[youtube] Publishing to channel ${CHANNEL_ID}`,
    );
    expect(mocks.assertYouTubeSessionReady).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalScopes: [
          'https://www.googleapis.com/auth/yt-analytics.readonly',
        ],
      }),
    );
  });

  it('refuses to upload when the signed-in account does not own the channel', async () => {
    const videoPath = await fixtureVideo();
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ error: { message: 'Forbidden' } }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const publisher = createYouTubePublisher({ fetchImpl });

    await expect(
      publisher.publishYouTube({
        title: '市場更新',
        description: '今天的市場重點',
        videoPath,
        thumbnailUrl: THUMBNAIL_URL,
        privacyStatus: 'public',
      }),
    ).rejects.toThrow(
      /YOUTUBE_PUBLISH_FAILED[\s\S]+Step: verify_channel[\s\S]+cannot report on YouTube channel UC-zap-nomad[\s\S]+Forbidden/u,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses to upload when no expected channel is configured', async () => {
    const videoPath = await fixtureVideo();
    vi.stubEnv('YOUTUBE_CHANNEL_ID', '  ');
    const fetchImpl = vi.fn<typeof fetch>();
    const publisher = createYouTubePublisher({ fetchImpl });

    await expect(
      publisher.publishYouTube({
        title: '市場更新',
        description: '今天的市場重點',
        videoPath,
        thumbnailUrl: THUMBNAIL_URL,
        privacyStatus: 'public',
      }),
    ).rejects.toThrow(
      /Step: verify_channel[\s\S]+YOUTUBE_CHANNEL_ID is not configured/u,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

async function fixtureThumbnailPng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: '#123456',
    },
  })
    .png()
    .toBuffer();
}

async function fixtureVideo(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'zap-youtube-'));
  directories.push(directory);
  const path = join(directory, 'episode.mp4');
  await writeFile(path, Buffer.from('fake-mp4'));
  return path;
}
