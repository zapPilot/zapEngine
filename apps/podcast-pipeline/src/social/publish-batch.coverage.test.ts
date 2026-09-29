import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSocialEpisode: vi.fn(),
  resolvePackagingAssignments: vi.fn(),
  generateSocialCopy: vi.fn(),
  prepareSocialBatchAssets: vi.fn(),
  createSocialPublishJobs: vi.fn(),
  createSocialPostPersister: vi.fn(),
  publishSocialPlatforms: vi.fn(),
}));

vi.mock('./episode.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./episode.js')>()),
  getSocialEpisode: mocks.getSocialEpisode,
}));
vi.mock('./packaging-experiments.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./packaging-experiments.js')>()),
  resolvePackagingAssignments: mocks.resolvePackagingAssignments,
}));
vi.mock('./copy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./copy.js')>()),
  generateSocialCopy: mocks.generateSocialCopy,
}));
vi.mock('./prepare-batch-assets.js', () => ({
  prepareSocialBatchAssets: mocks.prepareSocialBatchAssets,
  formatBytes: (value: number) => `${value}B`,
  formatDuration: (value: number) => `${value}s`,
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

import { prepareSocialBatchCopy, publishSocialBatch } from './publish-batch.js';

const episode: any = {
  id: 'episode-1',
  title: '標題',
  summary: '摘要',
  transcript: '逐字稿',
  publishedAt: '2026-09-24T00:00:00.000Z',
  episodeUrl: 'https://example.test/e/1',
  videoDurationSeconds: 120,
  videoUrl: 'https://example.test/video.mp4',
  videoThumbnailUrl: 'https://example.test/poster.jpg',
  languageCode: 'zh-Hant',
};

const copy: any = {
  topic: 'macro',
  rednote: { hookType: 'question', body: '正文', hashtags: ['一', '二', '三'] },
};

describe('publish batch coverage gaps', () => {
  it('forwards logLlm and strategy guidance when preparing copy', async () => {
    // WHY: the logLlm and strategy spreads only run when those options exist.
    mocks.getSocialEpisode.mockResolvedValue(episode);
    mocks.resolvePackagingAssignments.mockResolvedValue({});
    mocks.generateSocialCopy.mockResolvedValue({ copy, model: 'm' });

    const prepared = await prepareSocialBatchCopy({
      episodeId: episode.id,
      languageCode: 'zh-Hant',
      platforms: ['rednote'],
      strategyGuidanceByPlatform: { rednote: 'prefer short hooks' },
      logLlm: false,
    });

    expect(mocks.generateSocialCopy).toHaveBeenCalledWith(
      expect.objectContaining({
        logLlm: false,
        strategyGuidanceByPlatform: { rednote: 'prefer short hooks' },
      }),
    );
    expect(prepared.snapshot.model).toBe('m');
  });

  it('omits optional copy controls when they are not supplied', async () => {
    mocks.getSocialEpisode.mockResolvedValue(episode);
    mocks.resolvePackagingAssignments.mockResolvedValue({});
    mocks.generateSocialCopy.mockResolvedValue({ copy, model: 'm' });

    await prepareSocialBatchCopy({
      episodeId: episode.id,
      languageCode: 'zh-Hant',
      platforms: ['rednote'],
    });

    expect(mocks.generateSocialCopy).toHaveBeenCalledWith(
      expect.not.objectContaining({
        logLlm: expect.anything(),
        strategyGuidanceByPlatform: expect.anything(),
      }),
    );
  });

  it('uses the default logger and reports the error mapper when publishing', async () => {
    // WHY: the `?? noop` and `onError` mapper only run without an explicit logger.
    mocks.prepareSocialBatchAssets.mockResolvedValue({ episode });
    mocks.createSocialPublishJobs.mockReturnValue([]);
    mocks.createSocialPostPersister.mockImplementation((input: any) => {
      input.onError('telemetry failed');
      return vi.fn();
    });
    mocks.publishSocialPlatforms.mockResolvedValue([]);

    const onErrorLogs: string[] = [];
    const originalLog = console.log;
    console.log = (message: string) => onErrorLogs.push(message);
    try {
      await publishSocialBatch({
        episodeId: episode.id,
        languageCode: 'zh-Hant',
        platforms: [{ platform: 'rednote' }],
        packagingByPlatform: {},
        copySnapshot: { generated: copy, published: copy, model: 'm' },
        episode,
      });
    } finally {
      console.log = originalLog;
    }
    expect(mocks.publishSocialPlatforms).toHaveBeenCalled();
  });

  it('warns when a rednote video exceeds the general limit', async () => {
    // WHY: the duration warning only runs for long rednote videos.
    mocks.prepareSocialBatchAssets.mockResolvedValue({
      episode: { ...episode, videoDurationSeconds: 901 },
    });
    mocks.createSocialPublishJobs.mockReturnValue([]);
    mocks.createSocialPostPersister.mockReturnValue(vi.fn());
    mocks.publishSocialPlatforms.mockResolvedValue([]);
    const logs: string[] = [];

    await publishSocialBatch({
      episodeId: episode.id,
      languageCode: 'zh-Hant',
      platforms: [{ platform: 'rednote' }],
      packagingByPlatform: {},
      copySnapshot: { generated: copy, published: copy, model: 'm' },
      episode: { ...episode, videoDurationSeconds: 901 },
      onLog: (message: string) => logs.push(message),
    });

    expect(logs).toContainEqual(expect.stringContaining('above the general'));
  });
});
