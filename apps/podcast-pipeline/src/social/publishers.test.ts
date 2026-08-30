import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createPlaywrightRednotePublisher: vi.fn(),
  createPlaywrightXPublisher: vi.fn(),
  createThreadsPublisher: vi.fn(),
  createYouTubePublisher: vi.fn(),
  publishRednote: vi.fn(),
  publishThreads: vi.fn(),
  publishX: vi.fn(),
  publishYouTube: vi.fn(),
  prepareThreadsVideoUrl: vi.fn(),
}));

vi.mock('./x-playwright.js', () => ({
  createPlaywrightXPublisher: mocks.createPlaywrightXPublisher,
}));

vi.mock('./rednote-playwright.js', () => ({
  createPlaywrightRednotePublisher: mocks.createPlaywrightRednotePublisher,
}));

vi.mock('./threads.js', () => ({
  createThreadsPublisher: mocks.createThreadsPublisher,
}));

vi.mock('./youtube.js', () => ({
  createYouTubePublisher: mocks.createYouTubePublisher,
}));

vi.mock('./threads-video.js', () => ({
  prepareThreadsVideoUrl: mocks.prepareThreadsVideoUrl,
}));

import { createSocialPublishJobs } from './publishers.js';
import type { GeneratedSocialCopy, SocialEpisode } from './types.js';

const VIDEO_URL = 'https://media.example.com/episode-1.mp4';
const VIDEO_PATH = '/fixtures/episode-1.mp4';
const X_VIDEO_PATH = '/fixtures/episode-1-x.mp4';
const PUBLISHED = {
  status: 'published',
  publishedAt: '2026-08-15T00:00:00.000Z',
} as const;
const episode: Pick<SocialEpisode, 'title' | 'summary' | 'description'> = {
  title: '市場更新',
  summary: '完整說明',
};
const copy: GeneratedSocialCopy = {
  topic: 'macro',
  x: { hookType: 'question', text: '市場更新' },
  threads: { hookType: 'contrarian', text: '市場正在改變嗎？' },
  rednote: {
    hookType: 'question',
    title: '市場更新',
    body: '正文',
    hashtags: ['市場', '投資', '宏觀'],
  },
  youtube: { hookType: 'explainer', title: '市場更新' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.publishX.mockResolvedValue(PUBLISHED);
  mocks.publishThreads.mockResolvedValue(PUBLISHED);
  mocks.publishRednote.mockResolvedValue(PUBLISHED);
  mocks.publishYouTube.mockResolvedValue(PUBLISHED);
  mocks.createPlaywrightXPublisher.mockReturnValue({
    publishX: mocks.publishX,
  });
  mocks.createThreadsPublisher.mockReturnValue({
    publishThreads: mocks.publishThreads,
  });
  mocks.createPlaywrightRednotePublisher.mockReturnValue({
    publishRednote: mocks.publishRednote,
  });
  mocks.createYouTubePublisher.mockReturnValue({
    publishYouTube: mocks.publishYouTube,
  });
  mocks.prepareThreadsVideoUrl.mockResolvedValue(
    'https://cdn.example.com/threads.mp4',
  );
});

describe('createSocialPublishJobs', () => {
  it('builds Threads and X jobs with their native video transports', async () => {
    const jobs = await createSocialPublishJobs({
      platforms: ['threads', 'x'],
      copy,
      episode,
      videoUrl: VIDEO_URL,
      xVideoPath: X_VIDEO_PATH,
    });

    expect(jobs.map((job) => job.platform)).toEqual(['threads', 'x']);
    await jobs[0]?.publish();
    await jobs[1]?.publish();

    expect(mocks.publishThreads).toHaveBeenCalledWith({
      text: `${copy.threads!.text}\n\n官網 https://www.zap-pilot.org`,
      videoUrl: VIDEO_URL,
    });
    expect(mocks.publishX).toHaveBeenCalledWith({
      text: `${copy.x!.text}\n\n官網 https://www.zap-pilot.org`,
      videoPath: X_VIDEO_PATH,
    });
  });

  it('prepares Threads video with and without a reusable X teaser', async () => {
    await createSocialPublishJobs({
      platforms: ['threads'],
      copy,
      episode,
      videoUrl: VIDEO_URL,
      xVideoPath: X_VIDEO_PATH,
    });
    const withTeaser =
      mocks.createThreadsPublisher.mock.calls[0]?.[0]?.prepareVideoUrl;
    await expect(withTeaser?.(VIDEO_URL)).resolves.toEqual(expect.any(String));

    vi.clearAllMocks();
    mocks.createThreadsPublisher.mockReturnValue({
      publishThreads: mocks.publishThreads,
    });
    await createSocialPublishJobs({
      platforms: ['threads'],
      copy,
      episode,
      videoUrl: VIDEO_URL,
    });
    const withoutTeaser =
      mocks.createThreadsPublisher.mock.calls[0]?.[0]?.prepareVideoUrl;
    await expect(withoutTeaser?.(VIDEO_URL)).resolves.toEqual(
      expect.any(String),
    );
  });

  it('does not instantiate X when X is not selected', async () => {
    await createSocialPublishJobs({
      platforms: ['threads'],
      copy,
      episode,
      videoUrl: VIDEO_URL,
    });

    expect(mocks.createPlaywrightXPublisher).not.toHaveBeenCalled();
  });

  it('rejects X before publishing when no teaser is prepared', async () => {
    await expect(
      createSocialPublishJobs({
        platforms: ['x'],
        copy,
        episode,
        videoUrl: VIDEO_URL,
      }),
    ).rejects.toThrow('X publishing requires a prepared teaser video.');
    expect(mocks.createPlaywrightXPublisher).not.toHaveBeenCalled();
  });

  it('builds YouTube with the prepared full video and metadata', async () => {
    const [job] = await createSocialPublishJobs({
      platforms: ['youtube'],
      copy,
      episode,
      videoUrl: VIDEO_URL,
      videoPath: VIDEO_PATH,
    });

    await job?.publish();
    expect(mocks.publishYouTube).toHaveBeenCalledWith({
      title: '市場更新',
      description: '完整說明\n\n更多市場洞察與工具：https://www.zap-pilot.org',
      videoPath: VIDEO_PATH,
      languageCode: 'zh-Hant',
      privacyStatus: 'public',
    });
  });

  it('forwards the break-glass YouTube privacy override', async () => {
    const [job] = await createSocialPublishJobs({
      platforms: ['youtube'],
      copy,
      episode,
      videoUrl: VIDEO_URL,
      videoPath: VIDEO_PATH,
      youtubePrivacyStatus: 'unlisted',
    });

    await job?.publish();
    expect(mocks.publishYouTube).toHaveBeenCalledWith(
      expect.objectContaining({ privacyStatus: 'unlisted' }),
    );
  });

  it('rejects YouTube before publishing when video or episode metadata is missing', async () => {
    await expect(
      createSocialPublishJobs({
        platforms: ['youtube'],
        copy,
        episode,
        videoUrl: VIDEO_URL,
      }),
    ).rejects.toThrow('YouTube publishing requires a prepared video.');

    for (const blank of [
      {
        copy: { ...copy, youtube: { ...copy.youtube!, title: '   ' } },
        episode,
      },
      { copy, episode: { title: '市場更新', summary: '   ' } },
    ]) {
      await expect(
        createSocialPublishJobs({
          platforms: ['youtube'],
          copy: blank.copy,
          episode: blank.episode,
          videoUrl: VIDEO_URL,
          videoPath: VIDEO_PATH,
        }),
      ).rejects.toThrow(
        'YouTube publishing requires title and description metadata.',
      );
    }
  });

  it('builds Rednote with its native title field and no off-platform CTA', async () => {
    const [job] = await createSocialPublishJobs({
      platforms: ['rednote'],
      copy,
      episode,
      videoUrl: VIDEO_URL,
      videoPath: VIDEO_PATH,
    });

    await job?.publish();
    expect(mocks.publishRednote).toHaveBeenCalledWith({
      title: copy.rednote!.title,
      hashtags: copy.rednote!.hashtags,
      videoPath: VIDEO_PATH,
    });
  });

  it('rejects Rednote before publishing when the copy carries no title', async () => {
    await expect(
      createSocialPublishJobs({
        platforms: ['rednote'],
        copy: { ...copy, rednote: { ...copy.rednote!, title: '' } },
        episode,
        videoUrl: VIDEO_URL,
        videoPath: VIDEO_PATH,
      }),
    ).rejects.toThrow('Rednote publishing requires a generated title.');

    expect(mocks.createPlaywrightRednotePublisher).not.toHaveBeenCalled();
  });

  it('rejects unsupported platform values at the exhaustive boundary', async () => {
    await expect(
      createSocialPublishJobs({
        platforms: ['mastodon' as never],
        copy,
        episode,
        videoUrl: VIDEO_URL,
      }),
    ).rejects.toThrow('Unsupported social platform: mastodon');
  });

  // The composed post is the last thing Rednote review sees, and it is reached
  // from paths that never ran the generation schema (a hand-edited copy file).
  it('rejects Rednote before publishing when the composed post carries moderation-risk wording', async () => {
    await expect(
      createSocialPublishJobs({
        platforms: ['rednote'],
        copy: {
          ...copy,
          rednote: {
            ...copy.rednote!,
            hashtags: ['市場', '財富自由', '宏觀'],
          },
        },
        episode,
        videoUrl: VIDEO_URL,
        videoPath: VIDEO_PATH,
      }),
    ).rejects.toThrow(/moderation-risk wording/);

    expect(mocks.createPlaywrightRednotePublisher).not.toHaveBeenCalled();
  });

  it('rejects Rednote before publishing when no video is prepared', async () => {
    await expect(
      createSocialPublishJobs({
        platforms: ['rednote'],
        copy,
        episode,
        videoUrl: VIDEO_URL,
      }),
    ).rejects.toThrow('Rednote publishing requires a prepared video.');

    expect(mocks.createPlaywrightRednotePublisher).not.toHaveBeenCalled();
  });
});
