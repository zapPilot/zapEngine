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
import { SocialReleaseFailureError } from './publish-error.js';
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
    // The durable `social_posts` write runs before the machine-local file, so
    // the local entry must NOT exist yet when this is invoked.
    const persistPublished = vi.fn(async (published: PublishedSocialPost) => {
      const state = await readPublishState(path);
      expect(
        getPublishedPlatform(state, 'episode-1', published.platform),
      ).toBeUndefined();
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

  it('keeps a published job saved and skips it on retry after a later platform failed', async () => {
    const path = await statePath();
    const firstPublishX = vi
      .fn()
      .mockResolvedValue(success('2026-08-11T00:00:00.000Z'));
    const firstPublishThreads = vi
      .fn()
      .mockRejectedValue(new Error('API failed'));

    await expect(
      publishSocialPlatforms({
        episodeId: 'episode-1',
        jobs: [job('x', firstPublishX), job('threads', firstPublishThreads)],
        force: false,
        statePath: path,
      }),
    ).rejects.toThrow('API failed');
    expect(
      getPublishedPlatform(await readPublishState(path), 'episode-1', 'x'),
    ).toBeDefined();

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

  it('stops at the first transport failure and never calls a later job', async () => {
    const path = await statePath();
    const publishRednote = vi.fn();

    const error = await publishSocialPlatforms({
      episodeId: 'episode-1',
      jobs: [
        job('threads', vi.fn().mockRejectedValue(new Error('Threads failed'))),
        job('rednote', publishRednote),
      ],
      force: false,
      statePath: path,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SocialReleaseFailureError);
    const releaseError = error as SocialReleaseFailureError;
    expect(releaseError.platform).toBe('threads');
    expect(releaseError.phase).toBe('transport');
    expect(releaseError.publishedLanes).toEqual([]);
    expect(releaseError.untouchedLanes).toEqual(['rednote']);
    expect(publishRednote).not.toHaveBeenCalled();
  });

  it('reports which lanes already published before a later transport failure', async () => {
    const path = await statePath();
    const publishX = vi
      .fn()
      .mockResolvedValue(
        success('2026-08-11T00:05:00.000Z', 'https://x.com/status/2'),
      );

    const error = await publishSocialPlatforms({
      episodeId: 'episode-1',
      jobs: [
        job('x', publishX),
        job('youtube', vi.fn().mockRejectedValue(new Error('YouTube failed'))),
      ],
      force: false,
      statePath: path,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SocialReleaseFailureError);
    const releaseError = error as SocialReleaseFailureError;
    expect(releaseError.platform).toBe('youtube');
    expect(releaseError.publishedLanes).toEqual(['x']);
    expect(releaseError.untouchedLanes).toEqual([]);
    expect(publishX).toHaveBeenCalledOnce();
    expect(
      getPublishedPlatform(await readPublishState(path), 'episode-1', 'x'),
    ).toMatchObject({ url: 'https://x.com/status/2' });
  });

  it('fails the lane when the durable post record throws a non-Error value, before anything is saved locally', async () => {
    const path = await statePath();
    const onLog = vi.fn();
    const persistPublished = vi
      .fn()
      .mockRejectedValue('database string failure');

    const error = await publishSocialPlatforms({
      episodeId: 'episode-string-error',
      jobs: [
        job(
          'threads',
          vi.fn().mockResolvedValue(success('2026-08-11T00:01:00.000Z')),
        ),
      ],
      force: false,
      statePath: path,
      persistPublished,
      onLog,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SocialReleaseFailureError);
    expect((error as SocialReleaseFailureError).phase).toBe('telemetry');
    expect((error as Error).cause).toMatchObject({
      message: 'database string failure',
    });
    // Nothing durable and nothing local: the next tick re-checks `social_posts`,
    // finds no post, and legitimately retries the lane.
    expect(
      getPublishedPlatform(
        await readPublishState(path),
        'episode-string-error',
        'threads',
      ),
    ).toBeUndefined();
    expect(onLog).toHaveBeenCalledWith(
      '[threads] ⚠ Published remotely, but telemetry recording failed: database string failure',
    );
  });

  it('keeps the durable post record when the local duplicate state cannot be saved', async () => {
    const path = await statePath();
    const stateFailure = new Error('rename denied');
    fsMocks.rename.mockRejectedValueOnce(stateFailure);
    const persistPublished = vi.fn().mockResolvedValue(undefined);
    const onLog = vi.fn();

    const error = await publishSocialPlatforms({
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
      ],
      force: false,
      statePath: path,
      persistPublished,
      onLog,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SocialReleaseFailureError);
    expect((error as SocialReleaseFailureError).phase).toBe('state');
    expect((error as Error).cause).toBe(stateFailure);
    // The durable record is what protects against a duplicate publish, and it
    // has to survive a local-filesystem failure. This is the interleaving that
    // already produced two live Rednote posts for one episode.
    expect(persistPublished).toHaveBeenCalledTimes(1);
    expect(onLog).toHaveBeenCalledWith(
      '[x] ⚠ Published remotely, but local duplicate state was not saved: rename denied',
    );
  });
});
