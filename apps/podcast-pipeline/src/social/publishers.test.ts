import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertXSessionReady: vi.fn(),
  createOpenCliXPublisher: vi.fn(),
  createPlaywrightRednotePublisher: vi.fn(),
  createThreadsPublisher: vi.fn(),
  publishRednote: vi.fn(),
  publishThreads: vi.fn(),
  publishX: vi.fn(),
}));

vi.mock('./opencli.js', () => ({
  assertXSessionReady: mocks.assertXSessionReady,
  createOpenCliXPublisher: mocks.createOpenCliXPublisher,
}));

vi.mock('./rednote-playwright.js', () => ({
  createPlaywrightRednotePublisher: mocks.createPlaywrightRednotePublisher,
}));

vi.mock('./threads.js', () => ({
  createThreadsPublisher: mocks.createThreadsPublisher,
}));

import { createSocialPublishJobs } from './publishers.js';
import type { GeneratedSocialCopy } from './types.js';

const EPISODE_URL = 'https://example.com/e/episode-1';
const VIDEO_PATH = '/fixtures/episode-1.mp4';
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
  mocks.assertXSessionReady.mockResolvedValue(undefined);
  mocks.publishX.mockResolvedValue(PUBLISHED);
  mocks.publishThreads.mockResolvedValue(PUBLISHED);
  mocks.publishRednote.mockResolvedValue(PUBLISHED);
  mocks.createOpenCliXPublisher.mockReturnValue({ publishX: mocks.publishX });
  mocks.createThreadsPublisher.mockReturnValue({
    publishThreads: mocks.publishThreads,
  });
  mocks.createPlaywrightRednotePublisher.mockReturnValue({
    publishRednote: mocks.publishRednote,
  });
});

describe('createSocialPublishJobs', () => {
  it('builds jobs in requested order and preflights X inside its job', async () => {
    const jobs = await createSocialPublishJobs({
      platforms: ['threads', 'x'],
      copy,
      episodeUrl: EPISODE_URL,
    });

    expect(mocks.assertXSessionReady).not.toHaveBeenCalled();
    expect(jobs.map((job) => job.platform)).toEqual(['threads', 'x']);

    await jobs[0]?.publish();
    expect(mocks.assertXSessionReady).not.toHaveBeenCalled();
    await jobs[1]?.publish();
    expect(mocks.assertXSessionReady).toHaveBeenCalledOnce();
    expect(mocks.publishThreads).toHaveBeenCalledWith({
      text: copy.x.text,
      episodeUrl: EPISODE_URL,
    });
    expect(mocks.publishX).toHaveBeenCalledWith({
      text: copy.x.text,
      episodeUrl: EPISODE_URL,
    });
  });

  it('does not probe X when X is not selected', async () => {
    await createSocialPublishJobs({
      platforms: ['threads'],
      copy,
      episodeUrl: EPISODE_URL,
    });

    expect(mocks.assertXSessionReady).not.toHaveBeenCalled();
    expect(mocks.createOpenCliXPublisher).not.toHaveBeenCalled();
  });

  it('keeps later platform jobs runnable when X readiness fails', async () => {
    mocks.assertXSessionReady.mockRejectedValue(new Error('X is logged out'));
    const jobs = await createSocialPublishJobs({
      platforms: ['x', 'threads'],
      copy,
      episodeUrl: EPISODE_URL,
    });

    await expect(jobs[0]?.publish()).rejects.toThrow('X is logged out');
    await expect(jobs[1]?.publish()).resolves.toEqual(PUBLISHED);
    expect(mocks.publishX).not.toHaveBeenCalled();
    expect(mocks.publishThreads).toHaveBeenCalledOnce();
  });

  it('builds Rednote with the prepared video', async () => {
    const [job] = await createSocialPublishJobs({
      platforms: ['rednote'],
      copy,
      episodeUrl: EPISODE_URL,
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
        episodeUrl: EPISODE_URL,
      }),
    ).rejects.toThrow('Rednote publishing requires a prepared video.');

    expect(mocks.createPlaywrightRednotePublisher).not.toHaveBeenCalled();
  });
});
