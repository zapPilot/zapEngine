import { describe, expect, it } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';
import { collectRecentGithubFailureSignals } from './github-recent.js';

const NOW = new Date('2026-09-01T06:00:00.000Z');
const CONFIGURED = readControlCenterConfig({ OPS_GITHUB_TOKEN: 'ops-token' });

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function completedRun(input: {
  id: number;
  name: string;
  path: string;
  event: string;
  conclusion: string;
  startedAt: string;
  branch?: string | null;
}): Record<string, unknown> {
  return {
    id: input.id,
    name: input.name,
    path: input.path,
    event: input.event,
    status: 'completed',
    conclusion: input.conclusion,
    head_branch: input.branch ?? 'main',
    created_at: input.startedAt,
    run_started_at: input.startedAt,
    html_url: `https://github.com/zapPilot/zapEngine/actions/runs/${input.id}`,
  };
}

async function collect(runs: readonly unknown[]) {
  const calls: Array<{ url: string; headers: Headers }> = [];
  const fetchImpl: typeof fetch = (input, init) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return Promise.resolve(
      new Response(JSON.stringify({ workflow_runs: runs }), { status: 200 }),
    );
  };
  const signals = await collectRecentGithubFailureSignals({
    config: CONFIGURED,
    now: NOW,
    fetchImpl,
  });
  return { signals, calls };
}

describe('collectRecentGithubFailureSignals', () => {
  it('surfaces recent manual, alerting, and deleted-workflow failures', async () => {
    const { signals, calls } = await collect([
      completedRun({
        id: 33473740210,
        name: 'Environment apply',
        path: '.github/workflows/env-apply.yml',
        event: 'workflow_dispatch',
        conclusion: 'failure',
        startedAt: hoursAgo(0.5),
      }),
      completedRun({
        id: 33473750001,
        name: 'Release mobile',
        path: '.github/workflows/release-mobile.yml',
        event: 'workflow_dispatch',
        conclusion: 'failure',
        startedAt: hoursAgo(1),
      }),
      completedRun({
        id: 33473750002,
        name: 'Cron Failure Alert',
        path: '.github/workflows/cron-failure-alert.yml',
        event: 'workflow_run',
        conclusion: 'failure',
        startedAt: hoursAgo(1.5),
      }),
      completedRun({
        id: 33473750003,
        name: 'Ops MCP PR Bootstrap',
        path: '.github/workflows/ops-mcp-pr-bootstrap.yml',
        event: 'workflow_dispatch',
        conclusion: 'startup_failure',
        startedAt: hoursAgo(2),
      }),
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      'https://api.github.com/repos/zapPilot/zapEngine/actions/runs?branch=main&per_page=100',
    );
    expect(calls[0]?.headers.get('Authorization')).toBe('Bearer ops-token');
    expect(signals.map((signal) => signal.fingerprint)).toEqual([
      'github-actions:recent-failure/env-apply.yml',
      'github-actions:recent-failure/release-mobile.yml',
      'github-actions:recent-failure/cron-failure-alert.yml',
      'github-actions:recent-failure/ops-mcp-pr-bootstrap.yml',
    ]);
    expect(signals[0]).toMatchObject({
      status: 'degraded',
      url: 'https://github.com/zapPilot/zapEngine/actions/runs/33473740210',
      evidence: {
        workflow: 'env-apply.yml',
        runId: 33473740210,
        event: 'workflow_dispatch',
        branch: 'main',
        lastConclusion: 'failure',
      },
    });
    expect(signals[2]?.status).toBe('critical');
    expect(signals[2]?.detail).toContain('alerting blind spot');
  });

  it('does not duplicate schedule-owned failures or pull-request CI', async () => {
    const { signals } = await collect([
      completedRun({
        id: 10,
        name: 'Track Record Snapshot',
        path: '.github/workflows/track-record-snapshot.yml',
        event: 'schedule',
        conclusion: 'failure',
        startedAt: hoursAgo(1),
      }),
      completedRun({
        id: 11,
        name: 'CI',
        path: '.github/workflows/ci.yml',
        event: 'pull_request',
        conclusion: 'failure',
        startedAt: hoursAgo(0.5),
        branch: 'fix/example',
      }),
    ]);

    expect(signals).toEqual([]);
  });

  it('clears an older operational failure after a later success', async () => {
    const { signals } = await collect([
      completedRun({
        id: 21,
        name: 'Environment apply',
        path: '.github/workflows/env-apply.yml',
        event: 'workflow_dispatch',
        conclusion: 'success',
        startedAt: hoursAgo(1),
      }),
      completedRun({
        id: 20,
        name: 'Environment apply',
        path: '.github/workflows/env-apply.yml',
        event: 'workflow_dispatch',
        conclusion: 'failure',
        startedAt: hoursAgo(2),
      }),
    ]);

    expect(signals).toEqual([]);
  });

  it('lets a later scheduled success clear an older manual failure', async () => {
    const { signals } = await collect([
      completedRun({
        id: 31,
        name: 'Track Record Snapshot',
        path: '.github/workflows/track-record-snapshot.yml',
        event: 'schedule',
        conclusion: 'success',
        startedAt: hoursAgo(1),
      }),
      completedRun({
        id: 30,
        name: 'Track Record Snapshot',
        path: '.github/workflows/track-record-snapshot.yml',
        event: 'workflow_dispatch',
        conclusion: 'failure',
        startedAt: hoursAgo(2),
      }),
    ]);

    expect(signals).toEqual([]);
  });

  it('escalates consecutive operational failures and includes main pushes', async () => {
    const { signals } = await collect([
      completedRun({
        id: 41,
        name: 'Deploy Fly',
        path: '.github/workflows/deploy-fly.yml',
        event: 'push',
        conclusion: 'timed_out',
        startedAt: hoursAgo(1),
      }),
      completedRun({
        id: 40,
        name: 'Deploy Fly',
        path: '.github/workflows/deploy-fly.yml',
        event: 'workflow_dispatch',
        conclusion: 'failure',
        startedAt: hoursAgo(2),
      }),
      completedRun({
        id: 39,
        name: 'Deploy Fly',
        path: '.github/workflows/deploy-fly.yml',
        event: 'push',
        conclusion: 'success',
        startedAt: hoursAgo(3),
      }),
    ]);

    expect(signals).toHaveLength(1);
    expect(signals[0]?.status).toBe('critical');
    expect(signals[0]?.evidence['failureStreak']).toBe(2);
  });

  it('ages out an unretried operational failure after seven days', async () => {
    const { signals } = await collect([
      completedRun({
        id: 50,
        name: 'Release mobile',
        path: '.github/workflows/release-mobile.yml',
        event: 'workflow_dispatch',
        conclusion: 'failure',
        startedAt: hoursAgo(8 * 24),
      }),
    ]);

    expect(signals).toEqual([]);
  });

  it('reports a degraded reading when repository run history is unavailable', async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(new Response('', { status: 403 }));
    const signals = await collectRecentGithubFailureSignals({
      config: CONFIGURED,
      now: NOW,
      fetchImpl,
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      fingerprint: 'github-actions:recent-runs/repository',
      status: 'degraded',
      title: 'Recent GitHub Actions history unavailable',
    });
  });

  it('defers the unconfigured-token signal to the scheduled GitHub adapter', async () => {
    let called = false;
    const signals = await collectRecentGithubFailureSignals({
      config: readControlCenterConfig({}),
      now: NOW,
      fetchImpl: () => {
        called = true;
        return Promise.resolve(new Response('{}'));
      },
    });

    expect(called).toBe(false);
    expect(signals).toEqual([]);
  });
});
