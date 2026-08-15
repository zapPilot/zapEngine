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
  publishSocialPlatforms: vi.fn(),
  question: vi.fn(),
  readFile: vi.fn(),
  readPublishState: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawnSync: mocks.spawnSync,
}));

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  readFile: mocks.readFile,
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
}));

import { findPendingPlatforms, parseCliOptions, runSocialCli } from './cli.js';
import type {
  GeneratedSocialCopy,
  PlatformPublishState,
  SocialEpisode,
  SocialPlatform,
  SocialPublishState,
} from './types.js';

const EPISODE_ID = '123e4567-e89b-42d3-a456-426614174000';
const EPISODE_URL = `https://from-fed-to-chain-api.fly.dev/e/${EPISODE_ID}?lang=zh-Hant`;
const USAGE =
  'Usage: pnpm social:publish <episode-uuid-or-share-url> [--dry-run] [--platform x|threads|rednote] [--force]';
const PUBLISHED: PlatformPublishState = {
  published: true,
  publishedAt: '2026-08-11T00:00:00.000Z',
};
const VIDEO = {
  path: '/fixtures/social-video.mp4',
  sizeBytes: 5 * 1024 * 1024,
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
  videos: { zh: 'https://cdn.example.com/video.mp4' },
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
const originalExitCode = process.exitCode;
const originalStdinTty = Object.getOwnPropertyDescriptor(
  process.stdin,
  'isTTY',
);
const originalStdoutTty = Object.getOwnPropertyDescriptor(
  process.stdout,
  'isTTY',
);

function publishedState(
  platforms: readonly SocialPlatform[],
  episodeId = EPISODE_ID,
): SocialPublishState {
  return {
    [episodeId]: {
      zh: Object.fromEntries(
        platforms.map((platform) => [platform, PUBLISHED]),
      ),
    },
  };
}

function enableInteractiveReview(...answers: string[]): void {
  Object.defineProperty(process.stdin, 'isTTY', {
    configurable: true,
    value: true,
  });
  Object.defineProperty(process.stdout, 'isTTY', {
    configurable: true,
    value: true,
  });
  for (const answer of answers) {
    mocks.question.mockResolvedValueOnce(answer);
  }
}

function restoreProperty(
  target: NodeJS.ReadStream | NodeJS.WriteStream,
  key: 'isTTY',
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }
  Reflect.deleteProperty(target, key);
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
  mocks.readFile.mockResolvedValue(`${JSON.stringify(copy)}\n`);
  mocks.readPublishState.mockResolvedValue({});
  mocks.createSocialPublishJobs.mockImplementation(
    async (input: { platforms: readonly SocialPlatform[] }) =>
      input.platforms.map((platform) => ({ platform, publish: vi.fn() })),
  );
  mocks.createSocialPostPersister.mockReturnValue(mocks.persistPublished);
  mocks.spawnSync.mockReturnValue({ status: 0 });
  mocks.publishSocialPlatforms.mockResolvedValue([]);
  process.exitCode = undefined;
});

afterEach(() => {
  restoreProperty(process.stdin, 'isTTY', originalStdinTty);
  restoreProperty(process.stdout, 'isTTY', originalStdoutTty);
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('parseCliOptions', () => {
  it('parses a bare episode UUID with default options', () => {
    expect(parseCliOptions([EPISODE_ID])).toEqual({
      episodeId: EPISODE_ID,
      dryRun: false,
      force: false,
    });
  });

  it('parses a share URL and all supported flags', () => {
    expect(
      parseCliOptions([
        EPISODE_URL,
        '--dry-run',
        '--force',
        '--platform',
        'rednote',
      ]),
    ).toEqual({
      episodeId: EPISODE_ID,
      dryRun: true,
      force: true,
      platform: 'rednote',
    });
  });

  it('canonicalizes case and surrounding whitespace in a UUID', () => {
    expect(parseCliOptions([`  ${EPISODE_ID.toUpperCase()}  `]).episodeId).toBe(
      EPISODE_ID,
    );
  });

  it('accepts a long share URL query without changing the state key', () => {
    const longUrl = `https://example.com/e/${EPISODE_ID}?context=${'a'.repeat(2_000)}`;

    expect(parseCliOptions([longUrl]).episodeId).toBe(EPISODE_ID);
  });

  it('rejects empty arguments with usage guidance', () => {
    expect(() => parseCliOptions([])).toThrow(USAGE);
  });

  it('rejects a whitespace-only episode argument with usage guidance', () => {
    expect(() => parseCliOptions(['   '])).toThrow(USAGE);
  });

  it('rejects multiple positional arguments with usage guidance', () => {
    expect(() => parseCliOptions([EPISODE_ID, EPISODE_ID])).toThrow(USAGE);
  });

  it('returns usage guidance for the long help flag', () => {
    expect(() => parseCliOptions(['--help'])).toThrow(USAGE);
  });

  it('returns usage guidance for the short help flag', () => {
    expect(() => parseCliOptions(['-h'])).toThrow(USAGE);
  });

  it('rejects --lang: publishing is canonical Chinese only', () => {
    expect(() => parseCliOptions([EPISODE_ID, '--lang', 'ja'])).toThrow(
      "Unknown option '--lang'",
    );
  });

  it('rejects an empty platform value', () => {
    expect(() => parseCliOptions([EPISODE_ID, '--platform', ''])).toThrow(
      '--platform must be one of: x, threads, rednote.',
    );
  });

  it('rejects the obsolete twitter platform name', () => {
    expect(() =>
      parseCliOptions([EPISODE_ID, '--platform', 'twitter']),
    ).toThrow('--platform must be one of: x, threads, rednote.');
  });

  it('rejects inherited object keys as platform names', () => {
    expect(() =>
      parseCliOptions([EPISODE_ID, '--platform', 'constructor']),
    ).toThrow('--platform must be one of: x, threads, rednote.');
  });

  it('rejects an uppercase X platform', () => {
    expect(() => parseCliOptions([EPISODE_ID, '--platform', 'X'])).toThrow(
      '--platform must be one of: x, threads, rednote.',
    );
  });

  it('rejects an uppercase Rednote platform', () => {
    expect(() =>
      parseCliOptions([EPISODE_ID, '--platform', 'REDNOTE']),
    ).toThrow('--platform must be one of: x, threads, rednote.');
  });

  it('rejects an unknown option', () => {
    expect(() => parseCliOptions([EPISODE_ID, '--unknown'])).toThrow();
  });

  it('rejects a malformed episode identifier', () => {
    expect(() => parseCliOptions(['not-an-episode'])).toThrow(
      'Expected a bare UUID or a share URL with an /e/<uuid> path',
    );
  });
});

describe('runSocialCli', () => {
  it('does not download video for an X-only dry run', async () => {
    await runSocialCli([EPISODE_ID, '--dry-run', '--platform', 'x']);

    expect(mocks.getSocialEpisode).toHaveBeenCalledWith(EPISODE_ID);
    expect(mocks.prepareSocialVideo).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      `${copy.x.text}\n\n${episode.episodeUrl}`,
    );
    expect(console.log).toHaveBeenCalledWith('\nTaxonomy: macro / question');
    expect(console.log).toHaveBeenCalledWith(
      '🎬 video: 10m 00s (not downloaded; selected platforms do not require video)',
    );
  });

  it('downloads and previews video metadata for a Rednote dry run', async () => {
    await runSocialCli([EPISODE_ID, '--dry-run', '--platform', 'rednote']);

    expect(mocks.prepareSocialVideo).toHaveBeenCalledWith({
      episodeId: EPISODE_ID,
      url: episode.videos.zh,
    });
    expect(console.log).toHaveBeenCalledWith(
      `🎬 video: 10m 00s, 5.0 MB\n${VIDEO.path}`,
    );
    expect(console.log).toHaveBeenCalledWith(
      '\nDry run complete. Browser was not opened and nothing was published.',
    );
  });

  it('marks a reused Rednote video in the preview', async () => {
    mocks.prepareSocialVideo.mockResolvedValue({ ...VIDEO, reused: true });

    await runSocialCli([EPISODE_ID, '--dry-run', '--platform', 'rednote']);

    expect(console.log).toHaveBeenCalledWith(
      `🎬 video: 10m 00s, 5.0 MB, cached\n${VIDEO.path}`,
    );
  });

  it('does not inspect state or publishing boundaries during a dry run', async () => {
    await runSocialCli([EPISODE_ID, '--dry-run']);

    expect(mocks.readPublishState).not.toHaveBeenCalled();
    expect(mocks.createSocialPublishJobs).not.toHaveBeenCalled();
    expect(mocks.createSocialPostPersister).not.toHaveBeenCalled();
    expect(mocks.publishSocialPlatforms).not.toHaveBeenCalled();
  });

  it('fails before copy generation when Rednote has no completed video', async () => {
    mocks.getSocialEpisode.mockResolvedValue({
      ...episode,
      videos: {},
    });

    await expect(
      runSocialCli([EPISODE_ID, '--dry-run', '--platform', 'rednote']),
    ).rejects.toThrow(
      `No completed zh video found for episode ${EPISODE_ID}. Social publishing aborted.`,
    );
    expect(mocks.prepareSocialVideo).not.toHaveBeenCalled();
    expect(mocks.generateSocialCopy).not.toHaveBeenCalled();
  });

  it('returns before asset loading when every requested platform is complete', async () => {
    mocks.readPublishState.mockResolvedValue(
      publishedState(['x', 'threads', 'rednote']),
    );

    await runSocialCli([EPISODE_ID]);

    expect(mocks.getSocialEpisode).not.toHaveBeenCalled();
    expect(mocks.generateSocialCopy).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith('X       ✓');
    expect(console.log).toHaveBeenCalledWith('Rednote       ✓');
    expect(console.log).toHaveBeenCalledWith('Use --force to publish again.');
  });

  it('stops when a partial retry is declined', async () => {
    mocks.readPublishState.mockResolvedValue(publishedState(['rednote']));
    enableInteractiveReview('no');

    await runSocialCli([EPISODE_ID]);

    expect(mocks.question).toHaveBeenCalledWith('Retry X + Threads? [y/N] ');
    expect(mocks.getSocialEpisode).not.toHaveBeenCalled();
    expect(mocks.publishSocialPlatforms).not.toHaveBeenCalled();
  });

  it('carries only pending X through asset loading, readiness, and publishing', async () => {
    mocks.readPublishState.mockResolvedValue(
      publishedState(['threads', 'rednote']),
    );
    enableInteractiveReview('yes', 'x');

    await runSocialCli([EPISODE_ID]);

    expect(mocks.prepareSocialVideo).not.toHaveBeenCalled();
    expect(mocks.createSocialPublishJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        platforms: ['x'],
        copy,
        episodeUrl: EPISODE_URL,
      }),
    );
    expect(mocks.createSocialPublishJobs.mock.calls[0]?.[0]).not.toHaveProperty(
      'videoPath',
    );
    expect(mocks.publishSocialPlatforms).toHaveBeenCalledWith(
      expect.objectContaining({
        episodeId: EPISODE_ID,
        jobs: [expect.objectContaining({ platform: 'x' })],
      }),
    );
  });

  it('carries only pending Rednote through video preparation and publishing', async () => {
    mocks.readPublishState.mockResolvedValue(publishedState(['x', 'threads']));
    enableInteractiveReview('y', 'r');

    await runSocialCli([EPISODE_ID]);

    expect(mocks.prepareSocialVideo).toHaveBeenCalledOnce();
    expect(mocks.createSocialPublishJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        platforms: ['rednote'],
        videoPath: VIDEO.path,
      }),
    );
    expect(mocks.publishSocialPlatforms).toHaveBeenCalledWith(
      expect.objectContaining({
        jobs: [expect.objectContaining({ platform: 'rednote' })],
      }),
    );
  });

  it('bypasses existing state with force and publishes every requested platform', async () => {
    enableInteractiveReview('a');

    await runSocialCli([EPISODE_ID, '--force']);

    expect(mocks.readPublishState).not.toHaveBeenCalled();
    expect(mocks.prepareSocialVideo).toHaveBeenCalledOnce();
    expect(mocks.createSocialPublishJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        platforms: ['x', 'threads', 'rednote'],
        videoPath: VIDEO.path,
      }),
    );
    expect(mocks.publishSocialPlatforms).toHaveBeenCalledWith(
      expect.objectContaining({
        force: true,
        jobs: [
          expect.objectContaining({ platform: 'x' }),
          expect.objectContaining({ platform: 'threads' }),
          expect.objectContaining({ platform: 'rednote' }),
        ],
      }),
    );
  });

  it('quits from review without checking login or publishing', async () => {
    enableInteractiveReview('q');

    await runSocialCli([EPISODE_ID, '--platform', 'x']);

    expect(mocks.generateSocialCopy).toHaveBeenCalledOnce();
    expect(mocks.createSocialPublishJobs).not.toHaveBeenCalled();
    expect(mocks.publishSocialPlatforms).not.toHaveBeenCalled();
  });

  it('regenerates with reviewer feedback and publishes the revised copy', async () => {
    const revisedCopy: GeneratedSocialCopy = {
      ...copy,
      x: { text: 'Revised X copy' },
    };
    mocks.generateSocialCopy
      .mockResolvedValueOnce({ copy, model: 'first-model' })
      .mockResolvedValueOnce({ copy: revisedCopy, model: 'second-model' });
    enableInteractiveReview('g', '聚焦市場影響', 'x');

    await runSocialCli([EPISODE_ID, '--platform', 'x']);

    expect(mocks.generateSocialCopy).toHaveBeenNthCalledWith(1, { episode });
    expect(mocks.generateSocialCopy).toHaveBeenNthCalledWith(2, {
      episode,
      feedback: '聚焦市場影響',
    });
    expect(mocks.createSocialPublishJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        platforms: ['x'],
        copy: revisedCopy,
        episodeUrl: EPISODE_URL,
      }),
    );
    expect(mocks.createSocialPostPersister).toHaveBeenCalledWith({
      episodeId: EPISODE_ID,
      snapshot: {
        generated: revisedCopy,
        published: revisedCopy,
        model: 'second-model',
      },
      videoDurationSeconds: episode.videoDurationSeconds,
      onError: expect.any(Function),
    });
  });

  it('keeps the last AI snapshot separate from editor changes', async () => {
    const editedCopy: GeneratedSocialCopy = {
      ...copy,
      topic: 'market_event',
      hookType: 'breaking_event',
      x: { text: '人工編輯後的短文案' },
    };
    mocks.readFile.mockResolvedValueOnce(`${JSON.stringify(editedCopy)}\n`);
    enableInteractiveReview('e', 'x');

    await runSocialCli([EPISODE_ID, '--platform', 'x']);

    expect(mocks.createSocialPublishJobs).toHaveBeenCalledWith(
      expect.objectContaining({ copy: editedCopy }),
    );
    expect(mocks.createSocialPostPersister).toHaveBeenCalledWith({
      episodeId: EPISODE_ID,
      snapshot: {
        generated: copy,
        published: editedCopy,
        model: 'deepseek/deepseek-v4-flash',
      },
      videoDurationSeconds: episode.videoDurationSeconds,
      onError: expect.any(Function),
    });
  });

  it('reports an unknown review choice and continues prompting', async () => {
    enableInteractiveReview('invalid', 'q');

    await runSocialCli([EPISODE_ID, '--platform', 'x']);

    expect(console.log).toHaveBeenCalledWith('Unknown choice.');
    expect(mocks.question).toHaveBeenCalledTimes(2);
  });

  it('rejects interactive review when no TTY is available', async () => {
    await expect(runSocialCli([EPISODE_ID, '--platform', 'x'])).rejects.toThrow(
      'Interactive review requires a TTY. Use --dry-run in non-interactive environments.',
    );
    expect(mocks.createReadlineInterface).not.toHaveBeenCalled();
    expect(mocks.publishSocialPlatforms).not.toHaveBeenCalled();
  });

  it('warns for an over-limit Rednote video but still publishes', async () => {
    mocks.getSocialEpisode.mockResolvedValue({
      ...episode,
      videoDurationSeconds: 901,
    });
    enableInteractiveReview('r');

    await runSocialCli([EPISODE_ID, '--platform', 'rednote']);

    expect(console.warn).toHaveBeenCalledWith(
      "⚠ Rednote video is 15m 01s, above the platform's general 15-minute limit. Publishing will still be attempted.",
    );
    expect(mocks.publishSocialPlatforms).toHaveBeenCalledOnce();
  });

  it('propagates publisher preparation failure before publishing', async () => {
    mocks.createSocialPublishJobs.mockRejectedValue(
      new Error('X is logged out'),
    );
    enableInteractiveReview('x');

    await expect(runSocialCli([EPISODE_ID, '--platform', 'x'])).rejects.toThrow(
      'X is logged out',
    );
    expect(mocks.publishSocialPlatforms).not.toHaveBeenCalled();
  });

  it('passes the reviewed copy, URL, publisher, and logging callback to publish', async () => {
    enableInteractiveReview('x');

    await runSocialCli([EPISODE_ID, '--platform', 'x']);

    expect(mocks.createSocialPublishJobs).toHaveBeenCalledWith({
      platforms: ['x'],
      copy,
      episodeUrl: EPISODE_URL,
      videoPath: undefined,
      onLog: expect.any(Function),
    });
    expect(mocks.publishSocialPlatforms).toHaveBeenCalledWith({
      episodeId: EPISODE_ID,
      jobs: [expect.objectContaining({ platform: 'x' })],
      force: false,
      persistPublished: mocks.persistPublished,
      onLog: expect.any(Function),
    });
    const onLog = mocks.publishSocialPlatforms.mock.calls[0]?.[0].onLog;
    onLog('[x] published');
    expect(console.log).toHaveBeenCalledWith('[x] published');
    expect(console.log).toHaveBeenCalledWith('Done.');
  });

  it('sets a failing exit code and reports one failed platform', async () => {
    mocks.publishSocialPlatforms.mockResolvedValue([
      { platform: 'x', status: 'failed', error: new Error('failed') },
    ]);
    enableInteractiveReview('x');

    await runSocialCli([EPISODE_ID, '--platform', 'x']);

    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      'Done with 1 failed platform. Successfully published platforms with saved local state will be skipped next time.',
    );
  });

  it('reports multiple failed platforms with plural wording', async () => {
    mocks.publishSocialPlatforms.mockResolvedValue([
      { platform: 'x', status: 'failed', error: new Error('X failed') },
      {
        platform: 'rednote',
        status: 'failed',
        error: new Error('Rednote failed'),
      },
    ]);
    enableInteractiveReview('a');

    await runSocialCli([EPISODE_ID]);

    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      'Done with 2 failed platforms. Successfully published platforms with saved local state will be skipped next time.',
    );
  });

  it('distinguishes telemetry failure from platform publish failure', async () => {
    mocks.publishSocialPlatforms.mockResolvedValue([
      {
        platform: 'threads',
        status: 'published',
        recordError: new Error('database failed'),
      },
    ]);
    enableInteractiveReview('t');

    await runSocialCli([EPISODE_ID, '--platform', 'threads']);

    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      'Done with 1 telemetry record failure. The affected posts are live; use the payload above to restore each missing row.',
    );
    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining('failed platform'),
    );
  });

  it('warns that the local duplicate guard must be repaired after a state failure', async () => {
    mocks.publishSocialPlatforms.mockResolvedValue([
      {
        platform: 'x',
        status: 'published',
        stateError: new Error('state write failed'),
      },
    ]);
    enableInteractiveReview('x');

    await runSocialCli([EPISODE_ID, '--platform', 'x']);

    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      'Done with 1 local duplicate-state failure. That post is live, but ~/.zap-pilot/social-publisher.json was NOT saved for it. Verify the platform post and repair the local state before rerunning, or the CLI may publish a duplicate.',
    );
    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining('failed platform'),
    );
  });

  it('reports state and telemetry recovery independently when both writes fail', async () => {
    mocks.publishSocialPlatforms.mockResolvedValue([
      {
        platform: 'threads',
        status: 'published',
        stateError: new Error('state write failed'),
        recordError: new Error('database failed'),
      },
    ]);
    enableInteractiveReview('t');

    await runSocialCli([EPISODE_ID, '--platform', 'threads']);

    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      'Done with 1 local duplicate-state failure. That post is live, but ~/.zap-pilot/social-publisher.json was NOT saved for it. Verify the platform post and repair the local state before rerunning, or the CLI may publish a duplicate.',
    );
    expect(console.error).toHaveBeenCalledWith(
      'Done with 1 telemetry record failure. The affected posts are live; use the payload above to restore each missing row.',
    );
    const messages = vi
      .mocked(console.error)
      .mock.calls.flat()
      .map(String)
      .join('\n');
    expect(messages).not.toContain('saved locally');
  });
});

describe('findPendingPlatforms', () => {
  it('returns all requested platforms when state is empty', () => {
    expect(findPendingPlatforms({}, EPISODE_ID, ['x', 'rednote'])).toEqual([
      'x',
      'rednote',
    ]);
  });

  it('returns an empty list when no platforms are requested', () => {
    expect(findPendingPlatforms({}, EPISODE_ID, [])).toEqual([]);
  });

  it('removes a completed Rednote platform while preserving order', () => {
    expect(
      findPendingPlatforms(publishedState(['rednote']), EPISODE_ID, [
        'x',
        'rednote',
      ]),
    ).toEqual(['x']);
  });

  it('removes a completed X platform while preserving order', () => {
    expect(
      findPendingPlatforms(publishedState(['x']), EPISODE_ID, ['x', 'rednote']),
    ).toEqual(['rednote']);
  });

  it('returns no pending platforms when all requested platforms are complete', () => {
    expect(
      findPendingPlatforms(publishedState(['x', 'rednote']), EPISODE_ID, [
        'x',
        'rednote',
      ]),
    ).toEqual([]);
  });

  it('does not use state from a different episode', () => {
    expect(
      findPendingPlatforms(
        publishedState(['x', 'rednote'], 'another-episode'),
        EPISODE_ID,
        ['x', 'rednote'],
      ),
    ).toEqual(['x', 'rednote']);
  });
});
