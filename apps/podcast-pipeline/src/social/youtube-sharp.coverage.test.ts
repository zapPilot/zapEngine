import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertYouTubeSessionReady: vi.fn(),
  metadata: vi.fn().mockResolvedValue({}),
  stats: vi.fn().mockResolvedValue({}),
  sharp: vi.fn(),
}));

mocks.sharp.mockImplementation(() => ({
  metadata: mocks.metadata,
  stats: mocks.stats,
}));

vi.mock('sharp', () => ({ default: mocks.sharp }));
vi.mock('./youtube-auth.js', () => ({
  assertYouTubeSessionReady: mocks.assertYouTubeSessionReady,
  YOUTUBE_ANALYTICS_SCOPE:
    'https://www.googleapis.com/auth/yt-analytics.readonly',
}));

import { createYouTubePublisher } from './youtube.js';

const directories: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('YOUTUBE_CHANNEL_ID', 'UC-zap-nomad');
  mocks.metadata.mockResolvedValue({});
  mocks.stats.mockResolvedValue({});
  mocks.sharp.mockImplementation(() => ({
    metadata: mocks.metadata,
    stats: mocks.stats,
  }));
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

describe('YouTube thumbnail defensive metadata validation', () => {
  it('rejects a decoded thumbnail whose format cannot be identified', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zap-youtube-format-'));
    directories.push(directory);
    const videoPath = join(directory, 'episode.mp4');
    await writeFile(videoPath, Buffer.from('fake-mp4'));

    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (
        url.startsWith('https://youtubeanalytics.googleapis.com/v2/reports')
      ) {
        return new Response(JSON.stringify({ rows: [[0]] }), { status: 200 });
      }
      if (url === 'https://cdn.example.com/thumbnail') {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    await expect(
      createYouTubePublisher({ fetchImpl }).publishYouTube({
        title: '市場更新',
        description: '今天的市場重點',
        videoPath,
        thumbnailUrl: 'https://cdn.example.com/thumbnail',
        privacyStatus: 'public',
      }),
    ).rejects.toThrow('image format could not be identified');

    expect(mocks.metadata).toHaveBeenCalledOnce();
    expect(mocks.stats).toHaveBeenCalledOnce();
  });
});
