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

import { createYouTubePublisher } from './youtube.js';

const CHANNEL_ID = 'UC-zap-nomad';
const directories: string[] = [];

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
  vi.unstubAllEnvs();
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('YouTube upload stream failure cleanup', () => {
  it('closes the upload stream after API errors and malformed success responses', async () => {
    const cases = [
      {
        response: new Response('upstream upload failed', { status: 503 }),
        error: /YouTube API 503: upstream upload failed/u,
      },
      {
        response: new Response(JSON.stringify({ id: '   ' }), { status: 200 }),
        error: /did not include a video id/u,
      },
    ];

    const thumbnailBytes = await sharp({
      create: { width: 16, height: 16, channels: 3, background: '#123456' },
    })
      .png()
      .toBuffer();
    const thumbnailUrl = 'https://cdn.example.com/canonical-thumbnail.png';

    for (const testCase of cases) {
      const videoPath = await fixtureVideo();
      let uploadBody: { destroyed: boolean } | undefined;
      let requestCount = 0;
      const fetchImpl = vi.fn<typeof fetch>(async (input, init = {}) => {
        const url = String(input);
        if (url === thumbnailUrl) {
          return new Response(new Uint8Array(thumbnailBytes), {
            status: 200,
            headers: { 'content-type': 'image/png' },
          });
        }
        requestCount += 1;
        if (requestCount === 1) {
          return new Response(JSON.stringify({ rows: [[0]] }), { status: 200 });
        }
        if (requestCount === 2) {
          return new Response(null, {
            status: 200,
            headers: { location: 'https://upload.example/failure-session' },
          });
        }
        uploadBody = init.body as unknown as { destroyed: boolean };
        return testCase.response.clone();
      });
      const publisher = createYouTubePublisher({ fetchImpl });

      await expect(
        publisher.publishYouTube({
          title: '市場更新',
          description: '今天的市場重點',
          videoPath,
          thumbnailUrl,
          privacyStatus: 'public',
        }),
      ).rejects.toThrow(testCase.error);

      expect(uploadBody).toBeDefined();
      expect(uploadBody?.destroyed).toBe(true);
    }
  });
});

async function fixtureVideo(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'zap-youtube-stream-error-'));
  directories.push(directory);
  const path = join(directory, 'episode.mp4');
  await writeFile(path, Buffer.from('fake-mp4'));
  return path;
}
