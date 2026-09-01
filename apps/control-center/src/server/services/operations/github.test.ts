import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  readControlCenterConfig,
  type ControlCenterConfig,
} from '../../config/env.js';
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

function recentRun(input: {
  name: string;
  path: string;
  event: string;
  conclusion: string | null;
  startedAt: string;
}): Record<string, unknown> {
  return {
    ...completedRun(input),
    name: input.name,
    path: input.path,
    event: input.event,
    head_branch: 'main',
  };
}

function runsResponse(runs: readonly unknown[]): Response {
  return new Response(JSON.stringify({ workflow_runs: runs }), { status: 200 });
}

/**
 * The same run history for whichever workflow is asked about. A fresh
 * `Response` per call because a body can only be read once.
 */
function everyWorkflowRuns(...runs: readonly unknown[]): () => Response {
  return () => runsResponse(runs);
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

function githubEntry(
  name: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name,
    purpose: 'irrelevant to this adapter',
    schedule_kind: 'cron',
    schedule: '0 3 * * *',
    runtime: 'github-actions',
    entrypoint: `.github/workflows/${name}.yml`,
    ...overrides,
  };
}

async function repoWith(names: readonly string[]): Promise<string> {
  return scratchRepoRoot([
    ...names.map((name) => githubEntry(name)),
    { name: 'social-daemon', runtime: 'local-mac', entrypoint: 'x/daemon.ts' },
    { runtime: 'github-actions' },
  ]);
}

function recordingFetch(
  respond: (file: string) => Response,
  scheduleEntries: readonly unknown[] = [githubEntry('env-drift')],
  recentRuns: readonly unknown[] = [],
): {
  fetchImpl: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init?.headers) });
    if (url.includes('/contents/.github/schedules.json')) {
      return Promise.resolve(
        new Response(JSON.stringify(scheduleEntries), { status: 200 }),
      );
    }
    if (url.includes('/actions/runs?')) {
      return Promise.resolve(runsResponse(recentRuns));
    }
    const file = url.split('/runs?')[0]?.split('/').at(-1) ?? '';
    return Promise.resolve(respond(file));
  };
  return { fetchImpl, calls };
}

/** One adapter run against either a scratch repository or the remote registry. */
async function collect(input: {
  repoRoot?: string;
  config?: ControlCenterConfig;
  respond?: (file: string) => Response;
  recentRuns?: readonly unknown[];
  registrySource?: 'local' | 'remote-main';
}) {
  const { fetchImpl, calls } = recordingFetch(
    input.respond ?? everyWorkflowRuns(),
    [githubEntry('env-drift')],
    input.recentRuns,
  );
  const signals = await collectGithubSignals({
    config: input.config ?? CONFIGURED,
    now: NOW,
    fetchImpl,
    repoRoot: input.repoRoot,
    registrySource: input.registrySource,
  });
  return { signals, calls };
}

/**
 * One success, then sixty hours of nothing — a miss for a daily workflow and
 * an ordinary gap for a weekly one, which is the whole point of deriving the
 * stale window from the schedule instead of fixing it.
 */
async function collectAfterSilence(repoRoot: string) {
  return collect({
    repoRoot,
    respond: everyWorkflowRuns(
      completedRun({ conclusion: 'success', startedAt: hoursAgo(60) }),
    ),
  });
}

describe('collectGithubSignals', () => {
  it('reports unknown and sends nothing without a token', async () => {
    const { signals, calls } = await collect({
      config: readControlCenterConfig({}),
      repoRoot: await repoWith(['env-drift']),
    });

    expect(calls).toEqual([]);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.status).toBe('unknown');
    expect(signals[0]?.fingerprint).toBe('github-actions:unconfigured/token');
  });

  it('reports a healthy signal per scheduled workflow', async () => {
    const { signals, calls } = await collect({
      repoRoot: await repoWith(['backtest-refresh', 'env-drift']),
      respond: everyWorkflowRuns(
        completedRun({ conclusion: 'success', startedAt: hoursAgo(2) }),
      ),
    });

    expect(calls.map((call) => call.url)).toEqual([
      'https://api.github.com/repos/zapPilot/zapEngine/actions/workflows/backtest-refresh.yml/runs?per_page=5&event=schedule',
      'https://api.github.com/repos/zapPilot/zapEngine/actions/workflows/env-drift.yml/runs?per_page=5&event=schedule',
      'https://api.github.com/repos/zapPilot/zapEngine/actions/runs?branch=main&per_page=50',
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
    const { signals } = await collect({
      repoRoot: await repoWith(['ops-cost-sync']),
      respond: everyWorkflowRuns(
        completedRun({ conclusion: 'failure', startedAt: hoursAgo(2) }),
        completedRun({ conclusion: 'timed_out', startedAt: hoursAgo(26) }),
        completedRun({ conclusion: 'success', startedAt: hoursAgo(50) }),
      ),
    });

    expect(signals[0]?.status).toBe('critical');
    expect(signals[0]?.evidence['failureStreak']).toBe(2);
    expect(signals[0]?.title).toBe('ops-cost-sync failed 2 runs in a row');
  });

  it('degrades a first failure and sorts runs newest-first itself', async () => {
    const { signals } = await collect({
      repoRoot: await repoWith(['env-drift']),
      respond: everyWorkflowRuns(
        completedRun({ conclusion: 'success', startedAt: hoursAgo(26) }),
        {
          status: 'completed',
          conclusion: 'failure',
          created_at: 'not-a-date',
        },
        { status: 'in_progress', conclusion: null, created_at: hoursAgo(0) },
        completedRun({ conclusion: 'failure', startedAt: hoursAgo(1) }),
      ),
    });

    expect(signals[0]?.status).toBe('degraded');
    expect(signals[0]?.evidence).toMatchObject({
      failureStreak: 1,
      lastRunAt: hoursAgo(1),
      lastConclusion: 'failure',
    });
  });

  it('degrades a workflow whose newest run predates the 48h window', async () => {
    const { signals } = await collectAfterSilence(
      await repoWith(['track-record-snapshot']),
    );

    expect(signals[0]?.status).toBe('degraded');
    expect(signals[0]?.title).toBe('track-record-snapshot has not run in 60h');
  });

  it('leaves a weekly workflow healthy at the same 60h of silence', async () => {
    const { signals } = await collectAfterSilence(
      await scratchRepoRoot([
        githubEntry('weekly-audit', { schedule: '0 20 * * 1' }),
      ]),
    );

    expect(signals[0]?.status).toBe('healthy');
  });

  it('degrades a workflow with no completed run at all', async () => {
    const { signals } = await collect({
      repoRoot: await repoWith(['env-drift']),
      respond: everyWorkflowRuns({
        status: 'queued',
        conclusion: null,
        created_at: hoursAgo(1),
      }),
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
    const { signals } = await collect({
      repoRoot: await repoWith([
        'backtest-refresh',
        'env-drift',
        'ops-cost-sync',
      ]),
      respond: (file) => {
        if (file === 'backtest-refresh.yml') {
          return new Response('', { status: 404 });
        }
        if (file === 'env-drift.yml') {
          return new Response('<html>gateway</html>', { status: 200 });
        }
        return runsResponse([
          completedRun({ conclusion: 'success', startedAt: hoursAgo(3) }),
        ]);
      },
    });

    expect(signals.map((signal) => signal.status)).toEqual([
      'degraded',
      'degraded',
      'healthy',
    ]);
    expect(signals[0]?.detail).toBe(
      'GitHub run history for backtest-refresh.yml failed (404)',
    );
    expect(signals[0]?.fingerprint).toBe(
      'github-actions:workflow/backtest-refresh.yml',
    );
    expect(signals[1]?.title).toBe('env-drift run history unavailable');
  });

  it('collapses to one source failure when every request fails', async () => {
    const { signals } = await collect({
      repoRoot: await repoWith(['backtest-refresh', 'env-drift']),
      respond: () => new Response('', { status: 401 }),
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.fingerprint).toBe(
      'github-actions:source-failure/adapter',
    );
    expect(signals[0]?.status).toBe('degraded');
    expect(signals[0]?.detail).toContain('any of 2 scheduled workflows');
    expect(signals[0]?.detail).toContain(
      'GitHub run history for backtest-refresh.yml failed (401)',
    );
  });

  it('reports a source failure when schedules.json is unreadable', async () => {
    const { signals, calls } = await collect({
      repoRoot: await mkdtemp(join(tmpdir(), 'cc-github-empty-')),
    });

    expect(calls).toEqual([]);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.fingerprint).toBe(
      'github-actions:source-failure/adapter',
    );
  });

  it('reports a source failure when no workflow entries survive', async () => {
    const { signals } = await collect({ repoRoot: await repoWith([]) });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.detail).toContain('lists no github-actions workflows');
  });

  it('reads the schedule registry from GitHub for the remote-main source', async () => {
    const { signals, calls } = await collect({
      registrySource: 'remote-main',
      respond: everyWorkflowRuns(
        completedRun({ conclusion: 'success', startedAt: hoursAgo(4) }),
      ),
    });

    expect(calls[0]?.url).toBe(
      'https://api.github.com/repos/zapPilot/zapEngine/contents/.github/schedules.json?ref=main',
    );
    expect(calls[0]?.headers.get('Authorization')).toBe('Bearer ops-token');
    expect(calls[0]?.headers.get('Accept')).toBe(
      'application/vnd.github.raw+json',
    );
    expect(calls[1]?.url).toContain(
      'env-drift.yml/runs?per_page=5&event=schedule',
    );
    expect(calls[2]?.url).toBe(
      'https://api.github.com/repos/zapPilot/zapEngine/actions/runs?branch=main&per_page=50',
    );
    expect(signals.every((signal) => signal.status === 'healthy')).toBe(true);
  });

  it('surfaces recent main-branch failures outside the cron registry', async () => {
    const { signals } = await collect({
      repoRoot: await repoWith(['env-drift']),
      respond: everyWorkflowRuns(
        completedRun({ conclusion: 'success', startedAt: hoursAgo(2) }),
      ),
      recentRuns: [
        recentRun({
          name: 'Environment apply',
          path: '.github/workflows/env-apply.yml',
          event: 'workflow_dispatch',
          conclusion: 'failure',
          startedAt: hoursAgo(1),
        }),
        recentRun({
          name: 'Release mobile',
          path: '.github/workflows/release-mobile.yml',
          event: 'workflow_dispatch',
          conclusion: 'success',
          startedAt: hoursAgo(2),
        }),
      ],
    });

    expect(signals).toHaveLength(2);
    expect(signals[1]).toMatchObject({
      fingerprint:
        'github-actions:recent-workflow-failure/env-apply.yml:workflow_dispatch',
      status: 'degraded',
      title: 'Environment apply recent failure',
      evidence: {
        workflow: 'env-apply.yml',
        event: 'workflow_dispatch',
        headBranch: 'main',
        lastConclusion: 'failure',
      },
    });
  });

  it('drops recent failures older than the monitoring window', async () => {
    const { signals } = await collect({
      repoRoot: await repoWith(['env-drift']),
      respond: everyWorkflowRuns(
        completedRun({ conclusion: 'success', startedAt: hoursAgo(2) }),
      ),
      recentRuns: [
        recentRun({
          name: 'Environment apply',
          path: '.github/workflows/env-apply.yml',
          event: 'workflow_dispatch',
          conclusion: 'failure',
          startedAt: hoursAgo(25),
        }),
      ],
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.status).toBe('healthy');
  });
});
