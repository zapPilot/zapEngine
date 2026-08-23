import type { ReadStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertYouTubeSessionReady: vi.fn().mockResolvedValue({
    version: 1,
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 60_000,
    scope: 'https://www.googleapis.com/auth/youtube.upload',
  }),
}));

vi.mock('../../src/social/youtube-auth.js', () => ({
  assertYouTubeSessionReady: mocks.assertYouTubeSessionReady,
  YOUTUBE_ANALYTICS_SCOPE:
    'https://www.googleapis.com/auth/yt-analytics.readonly',
}));

import { createYouTubePublisher } from '../../src/social/youtube.js';

let directory: string | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (directory) {
    await rm(directory, { recursive: true, force: true });
    directory = undefined;
  }
});

describe('YouTube upload stream lifecycle', () => {
  it('closes the video stream after an upload request resolves without consuming it', async () => {
    vi.stubEnv('YOUTUBE_CHANNEL_ID', 'UC-zap-nomad');
    directory = await mkdtemp(join(tmpdir(), 'zap-youtube-stream-'));
    const videoPath = join(directory, 'episode.mp4');
    await writeFile(videoPath, Buffer.from('fake-mp4'));

    let uploadBody: ReadStream | undefined;
    let requestCount = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (input, init = {}) => {
      const url = String(input);
      if (url.startsWith('https://youtubeanalytics.googleapis.com/v2/reports')) {
        return new Response(JSON.stringify({ rows: [[0]] }), { status: 200 });
      }
      requestCount += 1;
      if (requestCount === 1) {
        return new Response(null, {
          status: 200,
          headers: { location: 'https://upload.example/session-stream' },
        });
      }
      uploadBody = init.body as unknown as ReadStream;
      return new Response(JSON.stringify({ id: 'yt-stream' }), { status: 200 });
    });

    const publisher = createYouTubePublisher({ fetchImpl });
    await expect(
      publisher.publishYouTube({
        title: '市場更新',
        description: '今天的市場重點',
        videoPath,
        privacyStatus: 'public',
      }),
    ).resolves.toMatchObject({ postId: 'yt-stream' });

    expect(uploadBody).toBeDefined();
    expect(uploadBody?.destroyed).toBe(true);
    expect(uploadBody?.closed).toBe(true);
  });
});
