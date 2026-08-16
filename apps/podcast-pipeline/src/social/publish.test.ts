import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Rename = typeof import('node:fs/promises').rename;

const fsMocks = vi.hoisted(() => ({
  rename: vi.fn(),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...original,
    rename: (...args: Parameters<Rename>) =>
      fsMocks.rename(original.rename, ...args),
  };
});

import { publishSocialPlatforms } from './publish.js';
import type { PublishedSocialPost } from './record.js';
import { getPublishedPlatform, readPublishState } from './state.js';
import type { PublishResult, SocialPublishJob } from './types.js';

async function statePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'social-publish-'));
  return join(directory, 'state.json');
}

function success(at: string, url?: string): PublishResult {
  return {
    status: 'published',
    publishedAt: at,
    ...(url ? { url } : {}),
  };
}

function job(
  platform: SocialPublishJob['platform'],
  publish: SocialPublishJob['publish'],
): SocialPublishJob {
  return { platform, publish };
}

beforeEach(() => {
  fsMocks.rename.mockReset();
  fsMocks.rename.mockImplementation(
    (rename: Rename, ...args: Parameters<Rename>) => rename(...args),
  );
});

describe('publishSocialPlatforms', () => {
  it('records every successful job', async () => {
    const path = await statePath();
    const persistPublished = vi.fn(async (published: PublishedSocialPost) => {
      const state = await readPublishState(path);
      expect(
        getPublishedPlatform(state, 'episode-1', published.platform),
      ).toBeDefined();
    });
    const jobs = [
      job(
        'x',
        vi
          .fn()
          .mockResolvedValue(
            success('2026-08-11T00:00:00.000Z', 'https://x.com/status/1'),
          ),
      ),
      job(
        'threads',
        vi.fn().mockResolvedValue(success('2026-08-11T00:01:00.000Z')),
      ),
      job(
        'rednote',
        vi.fn().mockResolvedValue(success('2026-08-11T00:02:00.000Z')),
      ),
    ];

    const outcomes = await publishSocialPlatforms({
      episodeId: 'episode-1',
      jobs,
      force: false,
      statePath: path,
      persistPublished,
    });

    expect(outcomes.map((item) => item.status)).toEqual([
      'published',
      'published',
      'published',
    ]);
    const state = await readPublishState(path);
    expect(getPublishedPlatform(state, 'episode-1', 'x')).toBeDefined();
    expect(getPublishedPlatform(state, 'episode-1', 'threads')).toBeDefined();
    expect(getPublishedPlatform(state, 'episode-1', 'rednote')).toBeDefined();
    expect(persistPublished).toHaveBeenCalledTimes(3);
    expect(persistPublished).toHaveBeenNthCalledWith(1, {
      platform: 'x',
      result: success('2026-08-11T00:00:00.000Z', 'https://x.com/status/1'),
    });
  });

  it('includes the stored URL when skipping an already-published platform', async () => {
    const path = await statePath();
    await publishSocialPlatforms({
      episodeId: 'episode-url',
      jobs: [
        job(
          'x',
          vi
            .fn()
            .mockResolvedValue(
              success(
                '2026-08-11T00:00:00.000Z',
                'https://x.com/status/skip-me',
              ),
            ),
        ),
      ],
      force: false,
      statePath: path,
    });

    await expect(
      publishSocialPlatforms({
        episodeId: 'episode-url',
        jobs: [job('x', vi.fn().mockRejectedValue(new Error('must not run')))],
        force: false,
        statePath: path,
      }),
    ).resolves.toEqual([
      {
        platform: 'x',
        status: 'skipped',
        url: 'https://x.com/status/skip-me',
      },
    ]);
  });

  it('keeps successful jobs and skips them on retry', async () => {
    const path = await statePath();
    const firstPublishX = vi
      .fn()
      .mockResolvedValue(success('2026-08-11T00:00:00.000Z'));
    const firstPublishThreads = vi
      .fn()
      .mockRejectedValue(new Error('API failed'));

    const first = await publishSocialPlatforms({
      episodeId: 'episode-1',
      jobs: [job('x', firstPublishX), job('threads', firstPublishThreads)],
      force: false,
      statePath: path,
    });
    expect(first.map((item) => item.status)).toEqual(['published', 'failed']);

    const retryPublishX = vi.fn().mockRejectedValue(new Error('must not run'));
    const retryPublishThreads = vi
      .fn()
      .mockResolvedValue(success('2026-08-11T00:03:00.000Z'));
    const persistPublished = vi.fn().mockResolvedValue(undefined);
    const retry = await publishSocialPlatforms({
      episodeId: 'episode-1',
      jobs: [job('x', retryPublishX), job('threads', retryPublishThreads)],
      force: false,
      statePath: path,
      persistPublished,
    });

    expect(retry.map((item) => item.status)).toEqual(['skipped', 'published']);
    expect(retryPublishX).not.toHaveBeenCalled();
    expect(retryPublishThreads).toHaveBeenCalledOnce();
    expect(persistPublished).toHaveBeenCalledOnce();
    expect(persistPublished).toHaveBeenCalledWith({
      platform: 'threads',
      result: success('2026-08-11T00:03:00.000Z'),
    });
  });

  it('continues to later jobs after a failure', async () => {
    const path = await statePath();
    const publishRednote = vi
      .fn()
      .mockResolvedValue(success('2026-08-11T00:04:00.000Z'));

    const outcomes = await publishSocialPlatforms({
      episodeId: 'episode-1',
      jobs: [
        job('threads', vi.fn().mockRejectedValue(new Error('Threads failed'))),
        job('rednote', publishRednote),
      ],
      force: false,
      statePath: path,
    });

    expect(outcomes.map((item) => item.status)).toEqual([
      'failed',
      'published',
    ]);
    expect(publishRednote).toHaveBeenCalledOnce();
  });

  it('publishes X independently when YouTube fails first', async () => {
    const path = await statePath();
    const publishX = vi
      .fn()
      .mockResolvedValue(
        success('2026-08-11T00:05:00.000Z', 'https://x.com/status/2'),
      );

    const outcomes = await publishSocialPlatforms({
      episodeId: 'episode-1',
      jobs: [
        job('youtube', vi.fn().mockRejectedValue(new Error('YouTube failed'))),
        job('x', publishX),
      ],
      force: false,
      statePath: path,
    });

    expect(outcomes.map((item) => item.status)).toEqual([
      'failed',
      'published',
    ]);
    expect(publishX).toHaveBeenCalledOnce();
    expect(
      getPublishedPlatform(await readPublishState(path), 'episode-1', 'x'),
    ).toMatchObject({ url: 'https://x.com/status/2' });
  });

  it('normalizes non-Error telemetry failures while keeping the post published', async () => {
    const path = await statePath();
    const onLog = vi.fn();
    const outcomes = await publishSocialPlatforms({
      episodeId: 'episode-string-error',
      jobs: [
        job(
          'threads',
          vi.fn().mockResolvedValue(success('2026-08-11T00:01:00.000Z')),
        ),
      ],
      force: false,
      statePath: path,
      persistPublished: vi.fn().mockRejectedValue('database string failure'),
      onLog,
    });

    expect(outcomes[0]).toMatchObject({
      platform: 'threads',
      status: 'published',
      recordError: expect.objectContaining({
        message: 'database string failure',
      }),
    });
    expect(onLog).toHaveBeenCalledWith(
      '[threads] ⚠ Published remotely, but telemetry recording failed: database string failure',
    );
  });

  it('keeps the post published locally and continues after telemetry persistence fails', async () => {
    const path = await statePath();
    const recordFailure = new Error('database insert failed');
    const persistPublished = vi
      .fn()
      .mockRejectedValueOnce(recordFailure)
      .mockResolvedValueOnce(undefined);
    const onLog = vi.fn();

    const outcomes = await publishSocialPlatforms({
      episodeId: 'episode-1',
      jobs: [
        job(
          'x',
          vi
            .fn()
            .mockResolvedValue(
              success('2026-08-11T00:00:00.000Z', 'https://x.com/status/1'),
            ),
        ),
        job(
          'threads',
          vi.fn().mockResolvedValue(success('2026-08-11T00:01:00.000Z')),
        ),
      ],
      force: false,
      statePath: path,
      persistPublished,
      onLog,
    });

    expect(outcomes).toEqual([
      {
        platform: 'x',
        status: 'published',
        url: 'https://x.com/status/1',
        recordError: recordFailure,
      },
      { platform: 'threads', status: 'published' },
    ]);
    expect(persistPublished).toHaveBeenCalledTimes(2);
    const state = await readPublishState(path);
    expect(getPublishedPlatform(state, 'episode-1', 'x')).toBeDefined();
    expect(getPublishedPlatform(state, 'episode-1', 'threads')).toBeDefined();
    expect(onLog).toHaveBeenCalledWith(
      '[x] ⚠ Published remotely, but telemetry recording failed: database insert failed',
    );
  });

  it('reports a published post, persists telemetry, and continues when local state fails', async () => {
    const path = await statePath();
    const stateFailure = new Error('rename denied');
    fsMocks.rename.mockRejectedValueOnce(stateFailure);
    const persistPublished = vi.fn().mockResolvedValue(undefined);
    const publishThreads = vi
      .fn()
      .mockResolvedValue(success('2026-08-11T00:01:00.000Z'));
    const onLog = vi.fn();

    const outcomes = await publishSocialPlatforms({
      episodeId: 'episode-1',
      jobs: [
        job(
          'x',
          vi
            .fn()
            .mockResolvedValue(
              success('2026-08-11T00:00:00.000Z', 'https://x.com/status/1'),
            ),
        ),
        job('threads', publishThreads),
      ],
      force: false,
      statePath: path,
      persistPublished,
      onLog,
    });

    expect(outcomes).toEqual([
      {
        platform: 'x',
        status: 'published',
        url: 'https://x.com/status/1',
        stateError: stateFailure,
      },
      { platform: 'threads', status: 'published' },
    ]);
    expect(persistPublished).toHaveBeenCalledTimes(2);
    expect(publishThreads).toHaveBeenCalledOnce();
    const state = await readPublishState(path);
    expect(getPublishedPlatform(state, 'episode-1', 'x')).toBeUndefined();
    expect(getPublishedPlatform(state, 'episode-1', 'threads')).toBeDefined();
    expect(onLog).toHaveBeenCalledWith(
      '[x] ⚠ Published remotely, but local duplicate state was not saved: rename denied',
    );
  });

  it('preserves both state and telemetry errors while continuing later platforms', async () => {
    const path = await statePath();
    const stateFailure = new Error('state write failed');
    const recordFailure = new Error('telemetry insert failed');
    fsMocks.rename.mockRejectedValueOnce(stateFailure);
    const persistPublished = vi
      .fn()
      .mockRejectedValueOnce(recordFailure)
      .mockResolvedValueOnce(undefined);
    const publishRednote = vi
      .fn()
      .mockResolvedValue(success('2026-08-11T00:02:00.000Z'));

    const outcomes = await publishSocialPlatforms({
      episodeId: 'episode-1',
      jobs: [
        job(
          'threads',
          vi.fn().mockResolvedValue(success('2026-08-11T00:01:00.000Z')),
        ),
        job('rednote', publishRednote),
      ],
      force: false,
      statePath: path,
      persistPublished,
    });

    expect(outcomes).toEqual([
      {
        platform: 'threads',
        status: 'published',
        stateError: stateFailure,
        recordError: recordFailure,
      },
      { platform: 'rednote', status: 'published' },
    ]);
    expect(persistPublished).toHaveBeenCalledTimes(2);
    expect(publishRednote).toHaveBeenCalledOnce();
  });
});
