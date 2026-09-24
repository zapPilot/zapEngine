import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepareSocialBatchAssets: vi.fn(),
  createSocialPublishJobs: vi.fn(),
  createSocialPostPersister: vi.fn(),
  publishSocialPlatforms: vi.fn(),
}));

vi.mock('./prepare-batch-assets.js', () => ({
  prepareSocialBatchAssets: mocks.prepareSocialBatchAssets,
}));
vi.mock('./publishers.js', () => ({
  createSocialPublishJobs: mocks.createSocialPublishJobs,
}));
vi.mock('./record.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./record.js')>()),
  createSocialPostPersister: mocks.createSocialPostPersister,
}));
vi.mock('./publish.js', () => ({
  publishSocialPlatforms: mocks.publishSocialPlatforms,
}));

import { publishSocialBatch } from './publish-batch.js';
import type { GeneratedSocialCopy, SocialEpisode } from './types.js';

const episode: SocialEpisode = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  languageCode: 'zh-Hant',
  title: '舊 canonical 長標題',
  summary: '摘要',
  transcript: '逐字稿',
  publishedAt: '2026-09-24T00:00:00.000Z',
  episodeUrl: 'https://example.com/e/1',
  videoDurationSeconds: 120,
  videoUrl: 'https://example.com/video.mp4',
  videoThumbnailUrl: 'https://example.com/poster.jpg',
};
const copy: GeneratedSocialCopy = {
  topic: 'macro',
  rednote: {
    hookType: 'question',
    body: '正文內容',
    hashtags: ['市場', '研究', '宏觀'],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prepareSocialBatchAssets.mockResolvedValue({
    episode,
    video: { path: '/tmp/video.mp4' },
  });
  mocks.createSocialPublishJobs.mockReturnValue([
    { platform: 'rednote', publish: vi.fn() },
  ]);
  mocks.createSocialPostPersister.mockReturnValue(vi.fn());
  mocks.publishSocialPlatforms.mockResolvedValue([
    { platform: 'rednote', status: 'published' },
  ]);
});

describe('publishSocialBatch title overrides', () => {
  it('passes a legacy override to both the transport and telemetry paths', async () => {
    await publishSocialBatch({
      episodeId: episode.id,
      languageCode: 'zh-Hant',
      platforms: [
        {
          platform: 'rednote',
          titleOverride: '舊佇列短標題',
        },
      ],
      packagingByPlatform: {},
      copySnapshot: {
        generated: copy,
        published: copy,
        model: 'test/model',
      },
      episode,
    });

    expect(mocks.createSocialPublishJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        titleOverrideByPlatform: { rednote: '舊佇列短標題' },
      }),
    );
    expect(mocks.createSocialPostPersister).toHaveBeenCalledWith(
      expect.objectContaining({
        titleOverrideByPlatform: { rednote: '舊佇列短標題' },
      }),
    );
  });

  it('keeps the override map empty for normal canonical-title jobs', async () => {
    await publishSocialBatch({
      episodeId: episode.id,
      languageCode: 'zh-Hant',
      platforms: [{ platform: 'rednote' }],
      packagingByPlatform: {},
      copySnapshot: {
        generated: copy,
        published: copy,
        model: 'test/model',
      },
      episode,
    });

    expect(mocks.createSocialPublishJobs).toHaveBeenCalledWith(
      expect.objectContaining({ titleOverrideByPlatform: {} }),
    );
    expect(mocks.createSocialPostPersister).toHaveBeenCalledWith(
      expect.objectContaining({ titleOverrideByPlatform: {} }),
    );
  });
});
