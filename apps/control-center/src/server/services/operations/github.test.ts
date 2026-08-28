import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';
import { collectGithubSignals } from './github.js';

const NOW = new Date('2026-08-28T12:00:00.000Z');
const CONFIGURED = readControlCenterConfig({ OPS_GITHUB_TOKEN: 'ops-token' });

interface Call {
  url: string;
  headers: Headers;
}

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function completedRun(input: {
  conclusion: string | null;
  startedAt: string;
}): Record<string, unknown> {
  return {
    status: 'completed',
    conclusion: input.conclusion,
    created_at: input.startedAt,
    run_started_at: input.startedAt,
    html_url: 'https://github.com/zapPilot/zapEngine/actions/runs/1',
  };
}

function runsResponse(runs: readonly unknown[]): Response {
  return new Response(JSON.stringify({ workflow_runs: runs }), { status: 200 });
}

/**
 * A repository root holding only what the adapter reads. The committed
 * `.github/schedules.json` grows and shrinks with the real cron fleet, so
 * asserting statuses against it would make these tests fail on unrelated
 * scheduling changes.
 */
async function scratchRepoRoot(entries: readonly unknown[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cc-github-'));
  await mkdir(join(root, '.github'), { recursive: true });
  await writeFile(
    join(root, '.github', 'schedules.json'),
    JSON.stringify(entries),
  );
  return root;
}

function githubEntry(name: string): Record<string, unknown> {
  return {
    name,
    purpose: 'irrelevant to this adapter',
    runtime: 'github-actions',
    entrypoint: `.github/workflows/${name}.yml`,
  };
}

async function repoWith(names: readonly string[]): Promise<string> {
  return scratchRepoRoot([
    ...names.map(githubEntry),
    { name: 'social-daemon', runtime: 'local-mac', entrypoint: 'x/daemon.ts' },
    { runtime: 'github-actions' },
  ]);
}

function recordingFetch(respond: (file: string) => Response): {
  fetchImpl: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init?.headers) });
    const file = url.split('/runs?')[0]?.split('/').at(-1) ?? '';
    return Promise.resolve(respond(file));
  };
  return { fetchImpl, calls };
}

describe('collectGithubSignals', () => {
  it('reports unknown and sends nothing without a token', async () => {
    const { fetchImpl, calls } = recordingFetch(() => runsResponse([]));

    const signals = await collectGithubSignals({
      config: readControlCenterConfig({}),
      now: NOW,
      fetchImpl,
      repoRoot: await repoWith(['env-drift']),
    });

    expect(calls).toEqual([]);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.status).toBe('unknown');
    expect(signals[0]?.fingerprint).toBe('github-actions:unconfigured/token');
  });

  it('reports a healthy signal per scheduled workflow', async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      runsResponse([
        completedRun({ conclusion: 'success', startedAt: hoursAgo(2) }),
      ]),
    );

    const signals = await collectGithubSignals({
      config: CONFIGURED,
      now: NOW,
      fetchImpl,
      repoRoot: await repoWith(['backtest-refresh', 'env-drift']),
    });

    expect(calls.map((call) => call.url)).toEqual([
      'https://api.github.com/repos/zapPilot/zapEngine/actions/workflows/backtest-refresh.yml/runs?per_page=5',
      'https://api.github.com/repos/zapPilot/zapEngine/actions/workflows/env-drift.yml/runs?per_page=5',
    ]);
    expect(calls[0]?.headers.get('Authorization')).toBe('Bearer ops-token');
    expect(calls[0]?.headers.get('Accept')).toBe('application/vnd.github+json');
    expect(calls[0]?.headers.get('X-GitHub-Api-Version')).toBe('2022-11-28');
    expect(signals.map((signal) => signal.status)).toEqual([
      'healthy',
      'healthy',
    ]);
    expect(signals[0]).toMatchObject({
      fingerprint: 'github-actions:workflow/backtest-refresh.yml',
      domain: 'jobs',
      source: 'github-actions',
      url: 'https://github.com/zapPilot/zapEngine/actions/runs/1',
      evidence: {
        workflow: 'backtest-refresh.yml',
        failureStreak: 0,
        lastRunAt: hoursAgo(2),
        lastConclusion: 'success',
      },
    });
  });

  it('escalates to critical when the two newest runs failed', async () => {
    const { fetchImpl } = recordingFetch(() =>
      runsResponse([
        completedRun({ conclusion: 'failure', startedAt: hoursAgo(2) }),
        completedRun({ conclusion: 'timed_out', startedAt: hoursAgo(26) }),
        completedRun({ conclusion: 'success', startedAt: hoursAgo(50) }),
      ]),
    );

    const signals = await collectGithubSignals({
      config: CONFIGURED,
      now: NOW,
      fetchImpl,
      repoRoot: await repoWith(['ops-cost-sync']),
    });

    expect(signals[0]?.status).toBe('critical');
    expect(signals[0]?.evidence['failureStreak']).toBe(2);
    expect(signals[0]?.title).toBe('ops-cost-sync failed 2 runs in a row');
  });

  it('degrades a first failure and sorts runs newest-first itself', async () => {
    const { fetchImpl } = recordingFetch(() =>
      runsResponse([
        completedRun({ conclusion: 'success', startedAt: hoursAgo(26) }),
        {
          status: 'completed',
          conclusion: 'failure',
          created_at: 'not-a-date',
        },
        { status: 'in_progress', conclusion: null, created_at: hoursAgo(0) },
        completedRun({ conclusion: 'failure', startedAt: hoursAgo(1) }),
      ]),
    );

    const signals = await collectGithubSignals({
      config: CONFIGURED,
      now: NOW,
      fetchImpl,
      repoRoot: await repoWith(['env-drift']),
    });

    expect(signals[0]?.status).toBe('degraded');
    expect(signals[0]?.evidence).toMatchObject({
      failureStreak: 1,
      lastRunAt: hoursAgo(1),
      lastConclusion: 'failure',
    });
  });

  it('degrades a workflow whose newest run predates the 48h window', async () => {
    const { fetchImpl } = recordingFetch(() =>
      runsResponse([
        completedRun({ conclusion: 'success', startedAt: hoursAgo(60) }),
      ]),
    );

    const signals = await collectGithubSignals({
      config: CONFIGURED,
      now: NOW,
      fetchImpl,
      repoRoot: await repoWith(['track-record-snapshot']),
    });

    expect(signals[0]?.status).toBe('degraded');
    expect(signals[0]?.title).toBe('track-record-snapshot has not run in 60h');
  });

  it('degrades a workflow with no completed run at all', async () => {
    const { fetchImpl } = recordingFetch(() =>
      runsResponse([
        { status: 'queued', conclusion: null, created_at: hoursAgo(1) },
      ]),
    );

    const signals = await collectGithubSignals({
      config: CONFIGURED,
      now: NOW,
      fetchImpl,
      repoRoot: await repoWith(['env-drift']),
    });

    expect(signals[0]?.status).toBe('degraded');
    expect(signals[0]?.evidence).toMatchObject({
      failureStreak: 0,
      lastRunAt: null,
      lastConclusion: null,
    });
    expect(signals[0]?.url).toBeNull();
  });

  it('keeps the other workflows when single requests fail', async () => {
    const { fetchImpl } = recordingFetch((file) => {
      if (file === 'backtest-refresh.yml') {
        return new Response('', { status: 404 });
      }
      if (file === 'env-drift.yml') {
        return new Response('<html>gateway</html>', { status: 200 });
      }
      return runsResponse([
        completedRun({ conclusion: 'success', startedAt: hoursAgo(3) }),
      ]);
    });

    const signals = await collectGithubSignals({
      config: CONFIGURED,
      now: NOW,
      fetchImpl,
      repoRoot: await repoWith([
        'backtest-refresh',
        'env-drift',
        'ops-cost-sync',
      ]),
    });

    expect(signals.map((signal) => signal.status)).toEqual([
      'degraded',
      'degraded',
      'healthy',
    ]);
    expect(signals[0]?.detail).toBe(
      'GitHub returned 404 for backtest-refresh.yml',
    );
    expect(signals[0]?.fingerprint).toBe(
      'github-actions:workflow/backtest-refresh.yml',
    );
    expect(signals[1]?.title).toBe('env-drift run history unavailable');
  });

  it('collapses to one source failure when every request fails', async () => {
    const { fetchImpl } = recordingFetch(
      () => new Response('', { status: 401 }),
    );

    const signals = await collectGithubSignals({
      config: CONFIGURED,
      now: NOW,
      fetchImpl,
      repoRoot: await repoWith(['backtest-refresh', 'env-drift']),
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.fingerprint).toBe(
      'github-actions:source-failure/adapter',
    );
    expect(signals[0]?.status).toBe('degraded');
    expect(signals[0]?.detail).toContain('any of 2 scheduled workflows');
    expect(signals[0]?.detail).toContain('GitHub returned 401');
  });

  it('reports a source failure when schedules.json is unreadable', async () => {
    const { fetchImpl, calls } = recordingFetch(() => runsResponse([]));

    const signals = await collectGithubSignals({
      config: CONFIGURED,
      now: NOW,
      fetchImpl,
      repoRoot: await mkdtemp(join(tmpdir(), 'cc-github-empty-')),
    });

    expect(calls).toEqual([]);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.fingerprint).toBe(
      'github-actions:source-failure/adapter',
    );
  });

  it('reports a source failure when no workflow entries survive', async () => {
    const { fetchImpl } = recordingFetch(() => runsResponse([]));

    const signals = await collectGithubSignals({
      config: CONFIGURED,
      now: NOW,
      fetchImpl,
      repoRoot: await repoWith([]),
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.detail).toContain('lists no github-actions workflows');
  });

  it('finds the workspace root when no repoRoot is passed', async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      runsResponse([
        completedRun({ conclusion: 'success', startedAt: hoursAgo(4) }),
      ]),
    );

    const signals = await collectGithubSignals({
      config: CONFIGURED,
      now: NOW,
      fetchImpl,
    });

    expect(calls.length).toBeGreaterThan(0);
    expect(
      calls.every((call) => call.url.includes('.yml/runs?per_page=5')),
    ).toBe(true);
    expect(signals.every((signal) => signal.status === 'healthy')).toBe(true);
  });
});
