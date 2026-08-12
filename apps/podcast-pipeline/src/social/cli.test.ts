import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateSocialCopy: vi.fn(),
  getSocialEpisode: vi.fn(),
  prepareSocialVideo: vi.fn(),
}));

vi.mock('./copy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./copy.js')>()),
  generateSocialCopy: mocks.generateSocialCopy,
}));

vi.mock('./episode.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./episode.js')>()),
  getSocialEpisode: mocks.getSocialEpisode,
}));

vi.mock('./video.js', () => ({
  prepareSocialVideo: mocks.prepareSocialVideo,
}));

import { findPendingPlatforms, runSocialCli } from './cli.js';
import type {
  GeneratedSocialCopy,
  SocialEpisode,
  SocialPublishState,
} from './types.js';

const EPISODE_ID = '123e4567-e89b-42d3-a456-426614174000';
const episode: SocialEpisode = {
  id: EPISODE_ID,
  title: 'Episode title',
  summary: 'Summary',
  transcript: 'Transcript',
  publishedAt: '2026-08-11T00:00:00.000Z',
  episodeUrl: `https://from-fed-to-chain-api.fly.dev/e/${EPISODE_ID}?lang=zh-Hant`,
  videoDurationSeconds: 600,
  videos: { zh: 'https://cdn.example.com/video.mp4' },
};
const copy: GeneratedSocialCopy = {
  hook: 'hook',
  x: { text: 'X copy' },
  rednote: {
    title: '小紅書標題',
    body: '小紅書正文',
    hashtags: ['以太坊', '美聯儲', '投資'],
  },
};

describe('runSocialCli', () => {
  beforeEach(() => {
    mocks.getSocialEpisode.mockResolvedValue(episode);
    mocks.generateSocialCopy.mockResolvedValue({
      copy,
      model: 'openrouter/free',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('does not download video for an X-only dry run', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runSocialCli([EPISODE_ID, '--dry-run', '--platform', 'x']);

    expect(mocks.getSocialEpisode).toHaveBeenCalledWith(EPISODE_ID, 'zh');
    expect(mocks.prepareSocialVideo).not.toHaveBeenCalled();
  });
});

describe('findPendingPlatforms', () => {
  it('removes completed platforms before asset preparation and login checks', () => {
    const state: SocialPublishState = {
      [EPISODE_ID]: {
        zh: {
          rednote: {
            published: true,
            publishedAt: '2026-08-11T00:00:00.000Z',
          },
        },
      },
    };

    expect(
      findPendingPlatforms(state, EPISODE_ID, 'zh', ['x', 'rednote']),
    ).toEqual(['x']);
  });
});
