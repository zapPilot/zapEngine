import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { DistributionSnapshotSource } from './distribution-snapshot.js';
import { runDistributionSnapshotCli } from './distribution-snapshot-cli.js';

const CONFIGURED_ENV = {
  SUPABASE_URL: 'https://project.supabase.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

function completeSource(): DistributionSnapshotSource {
  return {
    episodes: [
      {
        id: 'ep1',
        source_title: 'One article',
        source_url: 'https://example.test/ep1',
        created_at: '2026-08-19T00:00:00.000Z',
      },
    ],
    localizations: (['zh-Hant', 'ja', 'en'] as const).map((language) => ({
      episode_id: 'ep1',
      language_code: language,
      hls_url: 'https://cdn.test/main.m3u8',
      classroom_hls_url: null,
    })),
    videos: [
      { episode_id: 'ep1', status: 'completed' },
      { episode_id: 'ep1', status: 'completed' },
      { episode_id: 'ep1', status: 'completed' },
    ],
    posts: [
      {
        id: 'p1',
        episode_id: 'ep1',
        platform: 'x',
        language_code: 'zh-Hant',
        post_url: 'https://x.test/p1',
        published_at: '2026-08-20T00:00:00.000Z',
      },
      {
        id: 'p2',
        episode_id: 'ep1',
        platform: 'threads',
        language_code: 'zh-Hant',
        post_url: null,
        published_at: '2026-08-20T01:00:00.000Z',
      },
      {
        id: 'p3',
        episode_id: 'ep1',
        platform: 'rednote',
        language_code: 'zh-Hant',
        post_url: 'https://rednote.test/p3',
        published_at: '2026-08-20T02:00:00.000Z',
      },
    ],
    metrics: [
      {
        social_post_id: 'p1',
        captured_at: '2026-08-21T00:00:00.000Z',
        collection_status: 'collected',
        views: 250,
        impressions: null,
        likes: 3,
        comments: 0,
        shares: 0,
      },
    ],
    publishJobs: [{ status: 'completed' }],
    strategyVersions: [{ platform: 'x', language_code: 'zh-Hant' }],
  };
}

function harness(source: DistributionSnapshotSource = completeSource()) {
  const env: Record<string, string | undefined> = { ...CONFIGURED_ENV };
  return {
    write: vi.fn<(path: string, contents: string) => Promise<void>>(
      async () => undefined,
    ),
    log: vi.fn<(message: string) => void>(),
    warn: vi.fn<(message: string) => void>(),
    loadSource: vi.fn<() => Promise<DistributionSnapshotSource>>(
      async () => source,
    ),
    env,
  };
}

describe('runDistributionSnapshotCli', () => {
  it('writes a prettier-clean artifact to the default landing-page path', async () => {
    const deps = harness();

    await runDistributionSnapshotCli([], deps);

    expect(deps.write).toHaveBeenCalledTimes(1);
    const [path, contents] = deps.write.mock.calls[0] as [string, string];
    expect(path).toBe(
      resolve(
        process.cwd(),
        '../landing-page/src/data/distribution-snapshot.json',
      ),
    );
    expect(contents.endsWith('}\n')).toBe(true);
    expect(JSON.parse(contents)).toMatchObject({
      asOf: '2026-08-20T02:00:00.000Z',
      funnel: {
        articles: 1,
        localizations: 3,
        videos: 3,
        posts: 3,
        platforms: 3,
        reach: 250,
      },
    });
  });

  it('honours an explicit --out path', async () => {
    const deps = harness();

    await runDistributionSnapshotCli(['--out', 'tmp/snapshot.json'], deps);

    expect(deps.write.mock.calls[0]?.[0]).toBe(
      resolve(process.cwd(), 'tmp/snapshot.json'),
    );
  });

  it('reports the funnel it published', async () => {
    const deps = harness();

    await runDistributionSnapshotCli([], deps);

    const summary = deps.log.mock.calls.map(([line]) => line).join('\n');
    expect(summary).toMatch(/as of 2026-08-20T02:00:00.000Z/);
    expect(summary).toMatch(
      /1 articles -> 3 localizations -> 3 videos -> 3 posts on 3 platforms/,
    );
    expect(summary).toMatch(/250 reach across 3 channels/);
  });

  it('skips without writing when Supabase is not configured', async () => {
    const deps = harness();
    deps.env = {};

    await runDistributionSnapshotCli([], deps);

    expect(deps.warn).toHaveBeenCalledWith(
      'SKIP: distribution snapshot needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
    expect(deps.loadSource).not.toHaveBeenCalled();
    expect(deps.write).not.toHaveBeenCalled();
  });

  it('skips when only the service-role key is missing', async () => {
    const deps = harness();
    deps.env = { SUPABASE_URL: CONFIGURED_ENV.SUPABASE_URL };

    await runDistributionSnapshotCli([], deps);

    expect(deps.write).not.toHaveBeenCalled();
  });

  it('refuses to overwrite the artifact with an empty corpus', async () => {
    const deps = harness({
      episodes: [],
      localizations: [],
      videos: [],
      posts: [],
      metrics: [],
      publishJobs: [],
      strategyVersions: [],
    });

    await expect(runDistributionSnapshotCli([], deps)).rejects.toThrow(
      /Refusing to publish distribution snapshot/,
    );
    expect(deps.write).not.toHaveBeenCalled();
  });

  it('prints usage for --help without touching the database', async () => {
    const deps = harness();

    await runDistributionSnapshotCli(['--help'], deps);

    expect(deps.log.mock.calls[0]?.[0]).toMatch(
      /pnpm social:distribution-snapshot/,
    );
    expect(deps.loadSource).not.toHaveBeenCalled();
    expect(deps.write).not.toHaveBeenCalled();
  });

  it('rejects an unknown flag', async () => {
    const deps = harness();

    await expect(
      runDistributionSnapshotCli(['--nope'], deps),
    ).rejects.toThrow();
  });

  it('creates the output directory when writing for real', async () => {
    const deps = harness();
    const directory = await mkdtemp(join(tmpdir(), 'distribution-snapshot-'));
    const out = join(directory, 'nested', 'snapshot.json');

    try {
      await runDistributionSnapshotCli(['--out', out], {
        ...deps,
        write: undefined,
      });

      const written = await readFile(out, 'utf8');
      expect(written.endsWith('}\n')).toBe(true);
      expect(JSON.parse(written).funnel.posts).toBe(3);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
