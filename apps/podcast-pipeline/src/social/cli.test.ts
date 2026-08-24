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

vi.mock('./publishers.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./publishers.js')>()),
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
  xTeaserDurationSeconds: (durationSeconds: number) =>
    durationSeconds <= 140 ? durationSeconds : 132.8,
}));

import { findPendingPlatforms, parseCliOptions, runSocialCli } from './cli.js';
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
  languageCode: 'zh-Hant',
  videoUrl: VIDEO_URL,
};
const copy: GeneratedSocialCopy = {
  topic: 'macro',
  hookType: 'question',
  short: { text: 'X copy' },
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

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi
    .spyOn(console, 'error')
    .mockImplementation(() => undefined);
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
    expect(parseCliOptions([EPISODE_ID, '--language', 'zh-Hant'])).toEqual({
      episodeId: EPISODE_ID,
      languageCode: 'zh-Hant',
      dryRun: false,
      force: false,
      yes: false,
    });
  });

  it('parses a share URL and platform', () => {
    expect(
      parseCliOptions([
        EPISODE_URL,
        '--language',
        'zh-Hant',
        '--dry-run',
        '--platform',
        'threads',
      ]),
    ).toEqual({
      episodeId: EPISODE_ID,
      languageCode: 'zh-Hant',
      dryRun: true,
      force: false,
      yes: false,
      platform: 'threads',
    });
  });

  it('parses force and help/missing argument errors', () => {
    expect(
      parseCliOptions([EPISODE_ID, '--language', 'zh-Hant', '--force']),
    ).toMatchObject({
      force: true,
    });
    expect(() => parseCliOptions(['--help'])).toThrow(/Usage:/);
    expect(() => parseCliOptions([])).toThrow(/Usage:/);
  });

  it('parses unattended approval', () => {
    expect(
      parseCliOptions([
        EPISODE_ID,
        '--language',
        'zh-Hant',
        '--yes',
        '--platform',
        'threads',
      ]),
    ).toEqual({
      episodeId: EPISODE_ID,
      languageCode: 'zh-Hant',
      dryRun: false,
      force: false,
      yes: true,
      platform: 'threads',
    });
  });

  it('rejects obsolete language and platform values', () => {
    expect(() =>
      parseCliOptions([EPISODE_ID, '--language', 'zh-Hant', '--lang', 'ja']),
    ).toThrow();
    expect(() =>
      parseCliOptions([
        EPISODE_ID,
        '--language',
        'zh-Hant',
        '--platform',
        'twitter',
      ]),
    ).toThrow('--platform must be one of: x, threads, rednote, youtube.');
  });

  it('parses the break-glass YouTube privacy override', () => {
    expect(
      parseCliOptions([
        EPISODE_ID,
        '--language',
        'zh-Hant',
        '--youtube-privacy',
        'unlisted',
      ]),
    ).toEqual({
      episodeId: EPISODE_ID,
      languageCode: 'zh-Hant',
      dryRun: false,
      force: false,
      yes: false,
      youtubePrivacy: 'unlisted',
    });
    expect(() =>
      parseCliOptions([
        EPISODE_ID,
        '--language',
        'zh-Hant',
        '--youtube-privacy',
        'hidden',
      ]),
    ).toThrow('--youtube-privacy must be one of: private, unlisted, public.');
  });
});

describe('runSocialCli media preparation', () => {
  it('downloads the full video and creates a teaser for X-only', async () => {
    await runSocialCli([
      EPISODE_ID,
      '--language',
      'zh-Hant',
      '--dry-run',
      '--platform',
      'x',
    ]);

    expect(mocks.prepareSocialVideo).toHaveBeenCalledWith({
      episodeId: EPISODE_ID,
      languageCode: 'zh-Hant',
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
    await runSocialCli([
      EPISODE_ID,
      '--language',
      'zh-Hant',
      '--dry-run',
      '--platform',
      'threads',
    ]);

    expect(mocks.prepareSocialVideo).not.toHaveBeenCalled();
    expect(mocks.prepareXTeaserVideo).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(`🎬 native video: ${VIDEO_URL}`);
  });

  it('downloads the full video for YouTube but does not create an X teaser', async () => {
    await runSocialCli([
      EPISODE_ID,
      '--language',
      'zh-Hant',
      '--dry-run',
      '--platform',
      'youtube',
    ]);

    expect(mocks.prepareSocialVideo).toHaveBeenCalledOnce();
    expect(mocks.prepareXTeaserVideo).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      `🎬 video: 10m 00s, 5.0 MB\n${VIDEO.path}`,
    );
  });

  it('formats cached videos, short X videos, and KB-sized assets', async () => {
    mocks.getSocialEpisode.mockResolvedValue({
      ...episode,
      videoDurationSeconds: 90,
    });
    mocks.prepareSocialVideo.mockResolvedValue({
      ...VIDEO,
      sizeBytes: 512 * 1024,
      reused: true,
    });
    mocks.prepareXTeaserVideo.mockResolvedValue({
      ...X_VIDEO,
      sizeBytes: 256 * 1024,
      reused: true,
    });

    await runSocialCli([
      EPISODE_ID,
      '--language',
      'zh-Hant',
      '--dry-run',
      '--platform',
      'x',
    ]);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('✓ zh-Hant video (1m 30s, 512.0 KB, cached)'),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('✓ X video (1m 30s, 256.0 KB, cached/reused)'),
    );
  });

  it('downloads the full video for Rednote but does not create an X teaser', async () => {
    await runSocialCli([
      EPISODE_ID,
      '--language',
      'zh-Hant',
      '--dry-run',
      '--platform',
      'rednote',
    ]);

    expect(mocks.prepareSocialVideo).toHaveBeenCalledOnce();
    expect(mocks.prepareXTeaserVideo).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      `🎬 video: 10m 00s, 5.0 MB\n${VIDEO.path}`,
    );
    // Review previews Rednote's own title field, not a hook line prepended to
    // the description.
    expect(console.log).toHaveBeenCalledWith(`標題：${copy.rednote!.title}`);
    expect(console.log).toHaveBeenCalledWith(copy.rednote!.body);
  });

  it('fails before generation when a required canonical video URL is absent', async () => {
    mocks.getSocialEpisode.mockResolvedValue({ ...episode, videoUrl: '' });

    await expect(
      runSocialCli([
        EPISODE_ID,
        '--language',
        'zh-Hant',
        '--dry-run',
        '--platform',
        'x',
      ]),
    ).rejects.toThrow(
      `No completed zh-Hant video found for episode ${EPISODE_ID}. Social publishing aborted.`,
    );
    expect(mocks.generateSocialCopy).not.toHaveBeenCalled();
  });
});

describe('runSocialCli publishing', () => {
  it('publishes X with branded copy, public source URL and teaser path', async () => {
    enableInteractiveReview('x');
    await runSocialCli([
      EPISODE_ID,
      '--language',
      'zh-Hant',
      '--platform',
      'x',
    ]);

    expect(mocks.createSocialPublishJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        platforms: ['x'],
        videoUrl: VIDEO_URL,
        videoPath: VIDEO.path,
        xVideoPath: X_VIDEO.path,
        copy,
      }),
    );
    expect(mocks.createSocialPostPersister).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          generated: copy,
          published: copy,
        }),
      }),
    );
  });

  it('publishes YouTube with deterministic episode metadata', async () => {
    enableInteractiveReview('y');
    await runSocialCli([
      EPISODE_ID,
      '--language',
      'zh-Hant',
      '--platform',
      'youtube',
    ]);

    expect(mocks.createSocialPublishJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        platforms: ['youtube'],
        videoPath: VIDEO.path,
        episode,
      }),
    );
    expect(mocks.createSocialPostPersister).toHaveBeenCalledWith(
      expect.objectContaining({
        episode: expect.objectContaining({ title: episode.title }),
      }),
    );
  });

  it('keeps YouTube public unless the operator overrides privacy', async () => {
    enableInteractiveReview('y');
    await runSocialCli([
      EPISODE_ID,
      '--language',
      'zh-Hant',
      '--platform',
      'youtube',
    ]);

    expect(mocks.createSocialPublishJobs).toHaveBeenCalledWith(
      expect.not.objectContaining({ youtubePrivacyStatus: expect.anything() }),
    );
  });

  it('forwards and previews a one-off unlisted YouTube upload', async () => {
    enableInteractiveReview('y');
    await runSocialCli([
      EPISODE_ID,
      '--language',
      'zh-Hant',
      '--platform',
      'youtube',
      '--youtube-privacy',
      'unlisted',
    ]);

    expect(mocks.createSocialPublishJobs).toHaveBeenCalledWith(
      expect.objectContaining({ youtubePrivacyStatus: 'unlisted' }),
    );
    expect(console.log).toHaveBeenCalledWith('🔒 privacy override: unlisted');
  });

  it('publishes Threads without preparing a local file', async () => {
    enableInteractiveReview('t');
    await runSocialCli([
      EPISODE_ID,
      '--language',
      'zh-Hant',
      '--platform',
      'threads',
    ]);

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

  it('quits interactive review without publishing', async () => {
    enableInteractiveReview('q');
    await runSocialCli([
      EPISODE_ID,
      '--language',
      'zh-Hant',
      '--platform',
      'threads',
    ]);
    expect(mocks.createSocialPublishJobs).not.toHaveBeenCalled();
  });

  it('edits generated copy through EDITOR and returns to review', async () => {
    const previousEditor = process.env['EDITOR'];
    process.env['EDITOR'] = '/usr/bin/true';
    try {
      enableInteractiveReview('e', 't');
      await runSocialCli([
        EPISODE_ID,
        '--language',
        'zh-Hant',
        '--platform',
        'threads',
      ]);
      expect(mocks.createSocialPostPersister).toHaveBeenCalledOnce();
      expect(mocks.publishSocialPlatforms).toHaveBeenCalledOnce();
    } finally {
      if (previousEditor === undefined) delete process.env['EDITOR'];
      else process.env['EDITOR'] = previousEditor;
    }
  });

  it('surfaces editor spawn and non-zero exit failures', async () => {
    const previousEditor = process.env['EDITOR'];
    try {
      process.env['EDITOR'] = '/definitely/missing/editor';
      enableInteractiveReview('e');
      await expect(
        runSocialCli([
          EPISODE_ID,
          '--language',
          'zh-Hant',
          '--platform',
          'threads',
        ]),
      ).rejects.toThrow();

      process.env['EDITOR'] = '/usr/bin/false';
      enableInteractiveReview('e');
      await expect(
        runSocialCli([
          EPISODE_ID,
          '--language',
          'zh-Hant',
          '--platform',
          'threads',
        ]),
      ).rejects.toThrow('exited with status');
    } finally {
      if (previousEditor === undefined) delete process.env['EDITOR'];
      else process.env['EDITOR'] = previousEditor;
    }
  });

  it('regenerates with feedback and can recover from an unknown review choice', async () => {
    const regenerated: GeneratedSocialCopy = {
      ...copy,
      short: { text: 'Regenerated X copy' },
    };
    mocks.generateSocialCopy
      .mockResolvedValueOnce({ copy, model: 'model-1' })
      .mockResolvedValueOnce({ copy: regenerated, model: 'model-2' });
    enableInteractiveReview('g', 'make it sharper', 'unknown', 't');

    await runSocialCli([
      EPISODE_ID,
      '--language',
      'zh-Hant',
      '--platform',
      'threads',
    ]);

    expect(mocks.generateSocialCopy).toHaveBeenNthCalledWith(2, {
      episode,
      languageCode: 'zh-Hant',
      platforms: ['threads'],
      feedback: 'make it sharper',
    });
    expect(console.log).toHaveBeenCalledWith('Unknown choice.');
    expect(mocks.createSocialPostPersister).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          generated: regenerated,
          model: 'model-2',
        }),
      }),
    );
  });

  it('publishes all reviewed platforms with the all shortcut', async () => {
    enableInteractiveReview('a');
    await runSocialCli([EPISODE_ID, '--language', 'zh-Hant']);
    expect(mocks.createSocialPublishJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        platforms: ['x', 'threads', 'rednote', 'youtube'],
      }),
    );
  });

  it('warns but still publishes Rednote videos above 15 minutes', async () => {
    mocks.getSocialEpisode.mockResolvedValue({
      ...episode,
      videoDurationSeconds: 901,
    });
    await runSocialCli([
      EPISODE_ID,
      '--language',
      'zh-Hant',
      '--yes',
      '--platform',
      'rednote',
    ]);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('15-minute'),
    );
    expect(mocks.publishSocialPlatforms).toHaveBeenCalledOnce();
  });

  it('rejects interactive review when stdin is not a TTY', async () => {
    const stdinDescriptor = Object.getOwnPropertyDescriptor(
      process.stdin,
      'isTTY',
    );
    const stdoutDescriptor = Object.getOwnPropertyDescriptor(
      process.stdout,
      'isTTY',
    );
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: false,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: true,
    });
    try {
      await expect(
        runSocialCli([
          EPISODE_ID,
          '--language',
          'zh-Hant',
          '--platform',
          'threads',
        ]),
      ).rejects.toThrow('Interactive review requires a TTY');
    } finally {
      if (stdinDescriptor)
        Object.defineProperty(process.stdin, 'isTTY', stdinDescriptor);
      if (stdoutDescriptor)
        Object.defineProperty(process.stdout, 'isTTY', stdoutDescriptor);
    }
  });

  it('publishes without a TTY when --yes is provided', async () => {
    await runSocialCli([
      EPISODE_ID,
      '--language',
      'zh-Hant',
      '--yes',
      '--platform',
      'threads',
    ]);

    expect(mocks.createReadlineInterface).not.toHaveBeenCalled();
    expect(mocks.createSocialPublishJobs).toHaveBeenCalledWith(
      expect.objectContaining({ platforms: ['threads'] }),
    );
    expect(mocks.publishSocialPlatforms).toHaveBeenCalledOnce();
  });

  it('prompts before retrying pending platforms and accepts yes', async () => {
    const published: PlatformPublishState = {
      published: true,
      publishedAt: '2026-08-11T00:00:00.000Z',
    };
    mocks.readPublishState.mockResolvedValue({
      [EPISODE_ID]: { zh: { x: published } },
    });
    enableInteractiveReview('yes', 'a');

    await runSocialCli([EPISODE_ID, '--language', 'zh-Hant']);

    expect(mocks.createSocialPublishJobs).toHaveBeenCalledWith(
      expect.objectContaining({ platforms: ['threads', 'rednote', 'youtube'] }),
    );
  });

  it('stops when retrying pending platforms is declined', async () => {
    const published: PlatformPublishState = {
      published: true,
      publishedAt: '2026-08-11T00:00:00.000Z',
    };
    mocks.readPublishState.mockResolvedValue({
      [EPISODE_ID]: { zh: { x: published } },
    });
    enableInteractiveReview('n');

    await runSocialCli([EPISODE_ID, '--language', 'zh-Hant']);

    expect(mocks.getSocialEpisode).not.toHaveBeenCalled();
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

    await runSocialCli([EPISODE_ID, '--language', 'zh-Hant', '--yes']);

    expect(mocks.createReadlineInterface).not.toHaveBeenCalled();
    expect(mocks.createSocialPublishJobs).toHaveBeenCalledWith(
      expect.objectContaining({ platforms: ['threads', 'rednote', 'youtube'] }),
    );
  });

  it('force bypasses saved duplicate state', async () => {
    mocks.readPublishState.mockResolvedValue({
      [EPISODE_ID]: {
        zh: {
          threads: { published: true, publishedAt: '2026-08-11T00:00:00.000Z' },
        },
      },
    });
    await runSocialCli([
      EPISODE_ID,
      '--language',
      'zh-Hant',
      '--yes',
      '--force',
      '--platform',
      'threads',
    ]);
    expect(mocks.readPublishState).not.toHaveBeenCalled();
    expect(mocks.publishSocialPlatforms).toHaveBeenCalledOnce();
  });

  it('reports plural platform failures without inventing state or telemetry failures', async () => {
    mocks.publishSocialPlatforms.mockResolvedValue([
      { platform: 'x', status: 'failed', error: new Error('x failed') },
      {
        platform: 'threads',
        status: 'failed',
        error: new Error('threads failed'),
      },
    ]);

    await runSocialCli([EPISODE_ID, '--language', 'zh-Hant', '--yes']);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('2 failed platforms.'),
    );
    expect(
      consoleErrorSpy.mock.calls.some(([message]: unknown[]) =>
        String(message).includes('duplicate-state failure'),
      ),
    ).toBe(false);
    expect(
      consoleErrorSpy.mock.calls.some(([message]: unknown[]) =>
        String(message).includes('telemetry record failure'),
      ),
    ).toBe(false);
  });

  it('reports publish, local-state, and telemetry failures in singular and plural forms', async () => {
    mocks.publishSocialPlatforms.mockResolvedValue([
      { platform: 'x', status: 'failed', error: new Error('x failed') },
      {
        platform: 'threads',
        status: 'published',
        result: { status: 'published', publishedAt: '2026-08-11T00:00:00Z' },
        stateError: new Error('state failed'),
        recordError: new Error('record failed'),
      },
      {
        platform: 'rednote',
        status: 'published',
        result: { status: 'published', publishedAt: '2026-08-11T00:00:00Z' },
        stateError: new Error('state failed 2'),
        recordError: new Error('record failed 2'),
      },
    ]);

    await runSocialCli([EPISODE_ID, '--language', 'zh-Hant', '--yes']);

    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('1 failed platform.'),
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('2 local duplicate-state failures'),
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('2 telemetry record failures'),
    );
  });

  it('reports singular local-state and telemetry failures', async () => {
    mocks.publishSocialPlatforms.mockResolvedValue([
      {
        platform: 'threads',
        status: 'published',
        result: { status: 'published', publishedAt: '2026-08-11T00:00:00Z' },
        stateError: new Error('state failed'),
        recordError: new Error('record failed'),
      },
    ]);
    await runSocialCli([
      EPISODE_ID,
      '--language',
      'zh-Hant',
      '--yes',
      '--platform',
      'threads',
    ]);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(
        '1 local duplicate-state failure. That post is live',
      ),
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('1 telemetry record failure.'),
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

    await runSocialCli([EPISODE_ID, '--language', 'zh-Hant']);

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
