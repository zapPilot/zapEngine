import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runCli: vi.fn(),
  isMainModule: vi.fn(() => true),
  loadSource: vi.fn(),
}));

vi.mock('../lib/cli-runner.js', () => ({ runCli: mocks.runCli }));
vi.mock('../lib/is-main-module.js', () => ({
  isMainModule: mocks.isMainModule,
}));
vi.mock('./distribution-snapshot-source.js', () => ({
  loadDistributionSnapshotSource: mocks.loadSource,
}));

function completeSource() {
  return {
    episodes: [
      {
        id: 'ep1',
        source_title: 'One article',
        source_url: 'https://example.test/ep1',
        created_at: '2026-08-19T00:00:00.000Z',
      },
    ],
    localizations: ['zh-Hant', 'ja', 'en'].map((language) => ({
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
        post_url: null,
        published_at: '2026-08-20T02:00:00.000Z',
      },
    ],
    metrics: [],
    publishJobs: [],
    strategyVersions: [],
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.loadSource.mockResolvedValue(completeSource());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('distribution snapshot CLI default wiring', () => {
  it('uses process env, default source loader, real writer, and console logger', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://project.supabase.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role');
    const directory = await mkdtemp(join(tmpdir(), 'distribution-defaults-'));
    const output = join(directory, 'nested', 'snapshot.json');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      const { runDistributionSnapshotCli } =
        await import('./distribution-snapshot-cli.js');
      await runDistributionSnapshotCli(['--out', output]);

      expect(mocks.loadSource).toHaveBeenCalledOnce();
      expect(JSON.parse(await readFile(output, 'utf8')).funnel.posts).toBe(3);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('Wrote distribution snapshot'),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('uses console.warn with process env when credentials are absent', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { runDistributionSnapshotCli } =
      await import('./distribution-snapshot-cli.js');

    await runDistributionSnapshotCli([]);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('distribution snapshot needs'),
    );
    expect(mocks.loadSource).not.toHaveBeenCalled();
  });

  it('registers and executes the main callback without touching Supabase', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalArgv = process.argv;
    process.argv = ['node', 'snapshot', '--help'];
    try {
      await import('./distribution-snapshot-cli.js');
      expect(mocks.runCli).toHaveBeenCalledOnce();
      const main = mocks.runCli.mock.calls[0]?.[0] as () => Promise<void>;
      await main();
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('social:distribution-snapshot'),
      );
    } finally {
      process.argv = originalArgv;
    }
  });
});
