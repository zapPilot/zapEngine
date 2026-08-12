import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { publishSocialPlatforms } from './publish.js';
import { getPublishedPlatform, readPublishState } from './state.js';
import type { BrowserPublisher, GeneratedSocialCopy } from './types.js';

const VIDEO_PATH = '/fixtures/video.mp4';
const EPISODE_URL =
  'https://from-fed-to-chain-api.fly.dev/e/123e4567-e89b-42d3-a456-426614174000?lang=zh-Hant';
const copy: GeneratedSocialCopy = {
  hook: 'hook',
  x: { text: 'x copy' },
  rednote: {
    title: '小紅書標題',
    body: '小紅書正文',
    hashtags: ['以太坊', '美聯儲', '投資'],
  },
};

async function statePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'social-publish-'));
  return join(directory, 'state.json');
}

describe('publishSocialPlatforms', () => {
  it('records both successful platforms', async () => {
    const path = await statePath();
    const publisher: BrowserPublisher = {
      publishX: vi.fn().mockResolvedValue({
        status: 'published',
        publishedAt: '2026-08-11T00:00:00.000Z',
        url: 'https://x.com/example/status/1',
      }),
      publishRednote: vi.fn().mockResolvedValue({
        status: 'published',
        publishedAt: '2026-08-11T00:01:00.000Z',
      }),
    };

    const outcomes = await publishSocialPlatforms({
      episodeId: 'episode-1',
      language: 'zh',
      platforms: ['x', 'rednote'],
      force: false,
      copy,
      episodeUrl: EPISODE_URL,
      videoPath: VIDEO_PATH,
      publisher,
      statePath: path,
    });

    expect(outcomes.map((item) => item.status)).toEqual([
      'published',
      'published',
    ]);
    expect(publisher.publishX).toHaveBeenCalledWith({
      text: copy.x.text,
      episodeUrl: EPISODE_URL,
    });
    const state = await readPublishState(path);
    expect(getPublishedPlatform(state, 'episode-1', 'zh', 'x')).toBeDefined();
    expect(
      getPublishedPlatform(state, 'episode-1', 'zh', 'rednote'),
    ).toBeDefined();
  });

  it('keeps X success when Rednote fails and skips X on retry', async () => {
    const path = await statePath();
    const firstPublisher: BrowserPublisher = {
      publishX: vi.fn().mockResolvedValue({
        status: 'published',
        publishedAt: '2026-08-11T00:00:00.000Z',
      }),
      publishRednote: vi.fn().mockRejectedValue(new Error('upload failed')),
    };

    const first = await publishSocialPlatforms({
      episodeId: 'episode-1',
      language: 'zh',
      platforms: ['x', 'rednote'],
      force: false,
      copy,
      episodeUrl: EPISODE_URL,
      videoPath: VIDEO_PATH,
      publisher: firstPublisher,
      statePath: path,
    });
    expect(first.map((item) => item.status)).toEqual(['published', 'failed']);

    const retryPublisher: BrowserPublisher = {
      publishX: vi.fn().mockRejectedValue(new Error('must not be called')),
      publishRednote: vi.fn().mockResolvedValue({
        status: 'published',
        publishedAt: '2026-08-11T00:02:00.000Z',
      }),
    };
    const retry = await publishSocialPlatforms({
      episodeId: 'episode-1',
      language: 'zh',
      platforms: ['x', 'rednote'],
      force: false,
      copy,
      episodeUrl: EPISODE_URL,
      videoPath: VIDEO_PATH,
      publisher: retryPublisher,
      statePath: path,
    });

    expect(retry.map((item) => item.status)).toEqual(['skipped', 'published']);
    expect(retryPublisher.publishX).not.toHaveBeenCalled();
    expect(retryPublisher.publishRednote).toHaveBeenCalledOnce();
  });

  it('continues to Rednote when X fails', async () => {
    const path = await statePath();
    const publisher: BrowserPublisher = {
      publishX: vi.fn().mockRejectedValue(new Error('X failed')),
      publishRednote: vi.fn().mockResolvedValue({
        status: 'published',
        publishedAt: '2026-08-11T00:03:00.000Z',
      }),
    };

    const outcomes = await publishSocialPlatforms({
      episodeId: 'episode-1',
      language: 'zh',
      platforms: ['x', 'rednote'],
      force: false,
      copy,
      episodeUrl: EPISODE_URL,
      videoPath: VIDEO_PATH,
      publisher,
      statePath: path,
    });

    expect(outcomes.map((item) => item.status)).toEqual([
      'failed',
      'published',
    ]);
    const state = await readPublishState(path);
    expect(getPublishedPlatform(state, 'episode-1', 'zh', 'x')).toBeUndefined();
    expect(
      getPublishedPlatform(state, 'episode-1', 'zh', 'rednote'),
    ).toBeDefined();
  });
});
