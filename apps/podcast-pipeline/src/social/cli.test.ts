import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  closeReadline: vi.fn(),
  createSocialPublishJobs: vi.fn(),
  createSocialPostPersister: vi.fn(),
  createReadlineInterface: vi.fn(),
  generateSocialCopy: vi.fn(),
  getSocialEpisode: vi.fn(),
  persistPublished: vi.fn(),
  prepareSocialVideo: vi.fn(),
  prepareXTeaserVideo: vi.fn(),
  publishSocialPlatforms: vi.fn(),
  question: vi.fn(),
  readPublishState: vi.fn(),
}));

vi.mock('node:readline/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:readline/promises')>()),
  createInterface: mocks.createReadlineInterface,
}));

vi.mock('./copy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./copy.js')>()),
  generateSocialCopy: mocks.generateSocialCopy,
}));

vi.mock('./episode.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./episode.js')>()),
  getSocialEpisode: mocks.getSocialEpisode,
}));

vi.mock('./publish.js', () => ({
  publishSocialPlatforms: mocks.publishSocialPlatforms,
}));

vi.mock('./publishers.js', () => ({
  createSocialPublishJobs: mocks.createSocialPublishJobs,
}));

vi.mock('./record.js', () => ({
  createSocialPostPersister: mocks.createSocialPostPersister,
}));

vi.mock('./state.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state.js')>()),
  readPublishState: mocks.readPublishState,
}));

vi.mock('./video.js', () => ({
  prepareSocialVideo: mocks.prepareSocialVideo,
  prepareXTeaserVideo: mocks.prepareXTeaserVideo,
  X_TEASER_CONTENT_SECONDS: 130,
  X_VIDEO_LIMIT_SECONDS: 140,
}));

import {
  findPendingPlatforms,
  parseCliOptions,
  runSocialCli,
  withBrandCta,
} from './cli.js';
import type {
  GeneratedSocialCopy,
  PlatformPublishState,
  SocialEpisode,
  SocialPublishState,
} from './types.js';

const EPISODE_ID = '123e4567-e89b-42d3-a456-426614174000';
const EPISODE_URL = `https://from-fed-to-chain-api.fly.dev/e/${EPISODE_ID}?lang=zh-Hant`;
const VIDEO_URL = 'https://cdn.example.com/video.mp4';
const VIDEO = {
  path: '/fixtures/social-video.mp4',
  sizeBytes: 5 * 1024 * 1024,
  reused: false,
};
const X_VIDEO = {
  path: '/fixtures/social-video-x-v1.mp4',
  sizeBytes: 2 * 1024 * 1024,
  reused: false,
};
const episode: SocialEpisode = {
  id: EPISODE_ID,
  title: 'Episode title',
  summary: 'Summary',
  transcript: 'Transcript',
  publishedAt: '2026-08-11T00:00:00.000Z',
  episodeUrl: EPISODE_URL,
  videoDurationSeconds: 600,
  videos: { zh: VIDEO_URL },
};
const copy: GeneratedSocialCopy = {
  topic: 'macro',
  hookType: 'question',
  x: { text: 'X copy' },
  rednote: {
    title: '小紅書標題',
    body: '小紅書正文',
    hashtags: ['以太坊', '美聯儲', '投資'],
  },
};
const CTA = '官網 https://www.zap-pilot.org';
const originalExitCode = process.exitCode;
const originalStdinTty = Object.getOwnPropertyDescriptor(
  process.stdin,
  'isTTY',
);
const originalStdoutTty = Object.getOwnPropertyDescriptor(
  process.stdout,
  'isTTY',
);

function enableInteractiveReview(...answers: string[]): void {
  Object.defineProperty(process.stdin, 'isTTY', {
    configurable: true,
    value: true,
  });
  Object.defineProperty(process.stdout, 'isTTY', {
    configurable: true,
    value: true,
  });
  for (const answer of answers) mocks.question.mockResolvedValueOnce(answer);
}

function restoreProperty(
  target: NodeJS.ReadStream | NodeJS.WriteStream,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(target, 'isTTY', descriptor);
  } else {
    Reflect.deleteProperty(target, 'isTTY');
  }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  mocks.createReadlineInterface.mockReturnValue({
    close: mocks.closeReadline,
    question: mocks.question,
  });
  mocks.getSocialEpisode.mockResolvedValue(episode);
  mocks.generateSocialCopy.mockResolvedValue({
    copy,
    model: 'deepseek/deepseek-v4-flash',
  });
  mocks.prepareSocialVideo.mockResolvedValue(VIDEO);
  mocks.prepareXTeaserVideo.mockResolvedValue(X_VIDEO);
  mocks.readPublishState.mockResolvedValue({});
  mocks.createSocialPublishJobs.mockImplementation(
    async (input: { platforms: readonly string[] }) =>
      input.platforms.map((platform) => ({ platform, publish: vi.fn() })),
  );
  mocks.createSocialPostPersister.mockReturnValue(mocks.persistPublished);
  mocks.publishSocialPlatforms.mockResolvedValue([]);
  process.exitCode = undefined;
});

afterEach(() => {
  restoreProperty(process.stdin, originalStdinTty);
  restoreProperty(process.stdout, originalStdoutTty);
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('parseCliOptions', () => {
  it('parses defaults', () => {
    expect(parseCliOptions([EPISODE_ID])).toEqual({
      episodeId: EPISODE_ID,
      dryRun: false,
      force: false,
      yes: false,
    });
  });

  it('parses a share URL and platform', () => {
    expect(
      parseCliOptions([EPISODE_URL, '--dry-run', '--platform', 'threads']),
    ).toEqual({
      episodeId: EPISODE_ID,
      dryRun: true,
      force: false,
      yes: false,
      platform: 'threads',
    });
  });

  it('parses unattended approval', () => {
    expect(
      parseCliOptions([EPISODE_ID, '--yes', '--platform', 'threads']),
    ).toEqual({
      episodeId: EPISODE_ID,
      dryRun: false,
      force: false,
      yes: true,
      platform: 'threads',
    });
  });

  it('rejects obsolete language and platform values', () => {
    expect(() => parseCliOptions([EPISODE_ID, '--lang', 'ja'])).toThrow();
    expect(() =>
      parseCliOptions([EPISODE_ID, '--platform', 'twitter']),
    ).toThrow('--platform must be one of: x, threads, rednote, youtube.');
  });
});

describe('fixed brand CTA', () => {
  it('appends the same immutable destination to X/Threads and Rednote copy', () => {
    expect(withBrandCta(copy)).toEqual({
      ...copy,
      x: { text: `X copy\n\n${CTA}` },
      rednote: {
        ...copy.rednote,
        body: `小紅書正文\n\n${CTA}`,
      },
    });
    expect(copy.x.text).toBe('X copy');
  });
});

describe('runSocialCli media preparation', () => {
  it('downloads the full video and creates a teaser for X-only', async () => {
    await runSocialCli([EPISODE_ID, '--dry-run', '--platform', 'x']);

    expect(mocks.prepareSocialVideo).toHaveBeenCalledWith({
      episodeId: EPISODE_ID,
      url: VIDEO_URL,
    });
    expect(mocks.prepareXTeaserVideo).toHaveBeenCalledWith({
      episodeId: EPISODE_ID,
      sourcePath: VIDEO.path,
      durationSeconds: 600,
    });
    expect(console.log).toHaveBeenCalledWith(`X copy\n\n${CTA}`);
    expect(console.log).toHaveBeenCalledWith(
      `🎬 teaser: 2m 13s, 2.0 MB\n${X_VIDEO.path}`,
    );
  });

  it('keeps Threads-only remote and does not download the video', async () => {
    await runSocialCli([EPISODE_ID, '--dry-run', '--platform', 'threads']);

    expect(mocks.prepareSocialVideo).not.toHaveBeenCalled();
    expect(mocks.prepareXTeaserVideo).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(`🎬 native video: ${VIDEO_URL}`);
  });

  it('downloads the full video for YouTube but does not create an X teaser', async () => {
    await runSocialCli([EPISODE_ID, '--dry-run', '--platform', 'youtube']);

    expect(mocks.prepareSocialVideo).toHaveBeenCalledOnce();
    expect(mocks.prepareXTeaserVideo).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      `🎬 video: 10m 00s, 5.0 MB\n${VIDEO.path}`,
    );
  });

  it('downloads the full video for Rednote but does not create an X teaser', async () => {
    await runSocialCli([EPISODE_ID, '--dry-run', '--platform', 'rednote']);

    expect(mocks.prepareSocialVideo).toHaveBeenCalledOnce();
    expect(mocks.prepareXTeaserVideo).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      `🎬 video: 10m 00s, 5.0 MB\n${VIDEO.path}`,
    );
  });

  it('fails before generation when a required canonical video URL is absent', async () => {
    mocks.getSocialEpisode.mockResolvedValue({ ...episode, videos: {} });

    await expect(
      runSocialCli([EPISODE_ID, '--dry-run', '--platform', 'x']),
    ).rejects.toThrow(
      `No completed zh video found for episode ${EPISODE_ID}. Social publishing aborted.`,
    );
    expect(mocks.generateSocialCopy).not.toHaveBeenCalled();
  });
});

describe('runSocialCli publishing', () => {
  it('publishes X with branded copy, public source URL and teaser path', async () => {
    enableInteractiveReview('x');
    await runSocialCli([EPISODE_ID, '--platform', 'x']);

    expect(mocks.createSocialPublishJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        platforms: ['x'],
        videoUrl: VIDEO_URL,
        videoPath: VIDEO.path,
        xVideoPath: X_VIDEO.path,
        copy: expect.objectContaining({
          x: { text: `X copy\n\n${CTA}` },
        }),
      }),
    );
    expect(mocks.createSocialPostPersister).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          generated: copy,
          published: expect.objectContaining({
            x: { text: `X copy\n\n${CTA}` },
          }),
        }),
      }),
    );
  });

  it('publishes YouTube with deterministic episode metadata', async () => {
    enableInteractiveReview('y');
    await runSocialCli([EPISODE_ID, '--platform', 'youtube']);

    expect(mocks.createSocialPublishJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        platforms: ['youtube'],
        videoPath: VIDEO.path,
        youtubeTitle: episode.title,
        youtubeDescription: expect.stringContaining(
          'https://www.zap-pilot.org',
        ),
      }),
    );
    expect(mocks.createSocialPostPersister).toHaveBeenCalledWith(
      expect.objectContaining({
        youtubeMetadata: expect.objectContaining({ title: episode.title }),
      }),
    );
  });

  it('publishes Threads without preparing a local file', async () => {
    enableInteractiveReview('t');
    await runSocialCli([EPISODE_ID, '--platform', 'threads']);

    expect(mocks.prepareSocialVideo).not.toHaveBeenCalled();
    expect(mocks.createSocialPublishJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        platforms: ['threads'],
        videoUrl: VIDEO_URL,
      }),
    );
    const input = mocks.createSocialPublishJobs.mock.calls[0]?.[0];
    expect(input).not.toHaveProperty('videoPath');
    expect(input).not.toHaveProperty('xVideoPath');
  });

  it('publishes without a TTY when --yes is provided', async () => {
    await runSocialCli([EPISODE_ID, '--yes', '--platform', 'threads']);

    expect(mocks.createReadlineInterface).not.toHaveBeenCalled();
    expect(mocks.createSocialPublishJobs).toHaveBeenCalledWith(
      expect.objectContaining({ platforms: ['threads'] }),
    );
    expect(mocks.publishSocialPlatforms).toHaveBeenCalledOnce();
  });

  it('automatically retries only pending platforms with --yes', async () => {
    const published: PlatformPublishState = {
      published: true,
      publishedAt: '2026-08-11T00:00:00.000Z',
    };
    const state: SocialPublishState = {
      [EPISODE_ID]: { zh: { x: published } },
    };
    mocks.readPublishState.mockResolvedValue(state);

    await runSocialCli([EPISODE_ID, '--yes']);

    expect(mocks.createReadlineInterface).not.toHaveBeenCalled();
    expect(mocks.createSocialPublishJobs).toHaveBeenCalledWith(
      expect.objectContaining({ platforms: ['threads', 'rednote', 'youtube'] }),
    );
  });

  it('skips all asset work when all requested platforms were already published', async () => {
    const published: PlatformPublishState = {
      published: true,
      publishedAt: '2026-08-11T00:00:00.000Z',
    };
    const state: SocialPublishState = {
      [EPISODE_ID]: {
        zh: {
          x: published,
          threads: published,
          rednote: published,
          youtube: published,
        },
      },
    };
    mocks.readPublishState.mockResolvedValue(state);

    await runSocialCli([EPISODE_ID]);

    expect(mocks.getSocialEpisode).not.toHaveBeenCalled();
    expect(mocks.generateSocialCopy).not.toHaveBeenCalled();
    expect(mocks.publishSocialPlatforms).not.toHaveBeenCalled();
  });
});

describe('findPendingPlatforms', () => {
  it('returns only platforms without saved state', () => {
    const published: PlatformPublishState = {
      published: true,
      publishedAt: '2026-08-11T00:00:00.000Z',
    };
    const state: SocialPublishState = {
      [EPISODE_ID]: { zh: { x: published } },
    };
    expect(
      findPendingPlatforms(state, EPISODE_ID, ['x', 'threads', 'rednote']),
    ).toEqual(['threads', 'rednote']);
  });
});
