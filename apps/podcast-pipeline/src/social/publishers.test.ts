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

import { createSocialPublishJobs } from './publishers.js';
import type { GeneratedSocialCopy } from './types.js';

const VIDEO_URL = 'https://media.example.com/episode-1.mp4';
const VIDEO_PATH = '/fixtures/episode-1.mp4';
const X_VIDEO_PATH = '/fixtures/episode-1-x.mp4';
const PUBLISHED = {
  status: 'published',
  publishedAt: '2026-08-15T00:00:00.000Z',
} as const;
const copy: GeneratedSocialCopy = {
  topic: 'macro',
  hookType: 'question',
  x: { text: '市場更新' },
  rednote: {
    title: '市場更新',
    body: '正文',
    hashtags: ['市場', '投資', '宏觀'],
  },
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
});

describe('createSocialPublishJobs', () => {
  it('builds Threads and X jobs with their native video transports', async () => {
    const jobs = await createSocialPublishJobs({
      platforms: ['threads', 'x'],
      copy,
      videoUrl: VIDEO_URL,
      xVideoPath: X_VIDEO_PATH,
    });

    expect(jobs.map((job) => job.platform)).toEqual(['threads', 'x']);
    await jobs[0]?.publish();
    await jobs[1]?.publish();

    expect(mocks.publishThreads).toHaveBeenCalledWith({
      text: copy.x.text,
      videoUrl: VIDEO_URL,
    });
    expect(mocks.publishX).toHaveBeenCalledWith({
      text: copy.x.text,
      videoPath: X_VIDEO_PATH,
    });
  });

  it('does not instantiate X when X is not selected', async () => {
    await createSocialPublishJobs({
      platforms: ['threads'],
      copy,
      videoUrl: VIDEO_URL,
    });

    expect(mocks.createPlaywrightXPublisher).not.toHaveBeenCalled();
  });

  it('rejects X before publishing when no teaser is prepared', async () => {
    await expect(
      createSocialPublishJobs({
        platforms: ['x'],
        copy,
        videoUrl: VIDEO_URL,
      }),
    ).rejects.toThrow('X publishing requires a prepared teaser video.');
    expect(mocks.createPlaywrightXPublisher).not.toHaveBeenCalled();
  });

  it('builds YouTube with the prepared full video and metadata', async () => {
    const [job] = await createSocialPublishJobs({
      platforms: ['youtube'],
      copy,
      videoUrl: VIDEO_URL,
      videoPath: VIDEO_PATH,
      youtubeTitle: '市場更新',
      youtubeDescription: '完整說明',
    });

    await job?.publish();
    expect(mocks.publishYouTube).toHaveBeenCalledWith({
      title: '市場更新',
      description: '完整說明',
      videoPath: VIDEO_PATH,
      privacyStatus: 'public',
    });
  });

  it('rejects YouTube before publishing when video or metadata is missing', async () => {
    await expect(
      createSocialPublishJobs({
        platforms: ['youtube'],
        copy,
        videoUrl: VIDEO_URL,
        youtubeTitle: '市場更新',
        youtubeDescription: '完整說明',
      }),
    ).rejects.toThrow('YouTube publishing requires a prepared video.');

    await expect(
      createSocialPublishJobs({
        platforms: ['youtube'],
        copy,
        videoUrl: VIDEO_URL,
        videoPath: VIDEO_PATH,
      }),
    ).rejects.toThrow(
      'YouTube publishing requires title and description metadata.',
    );
  });

  it('builds Rednote with the prepared full video', async () => {
    const [job] = await createSocialPublishJobs({
      platforms: ['rednote'],
      copy,
      videoUrl: VIDEO_URL,
      videoPath: VIDEO_PATH,
    });

    await job?.publish();
    expect(mocks.publishRednote).toHaveBeenCalledWith({
      title: copy.rednote.title,
      body: copy.rednote.body,
      hashtags: copy.rednote.hashtags,
      videoPath: VIDEO_PATH,
    });
  });

  it('rejects Rednote before publishing when no video is prepared', async () => {
    await expect(
      createSocialPublishJobs({
        platforms: ['rednote'],
        copy,
        videoUrl: VIDEO_URL,
      }),
    ).rejects.toThrow('Rednote publishing requires a prepared video.');

    expect(mocks.createPlaywrightRednotePublisher).not.toHaveBeenCalled();
  });
});
