import { afterEach, describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';
import { collectRecentGithubFailureSignals } from './github-recent.js';

const NOW = new Date('2026-09-01T06:00:00.000Z');
const CONFIGURED = readControlCenterConfig({ OPS_GITHUB_TOKEN: 'ops-token' });

function hoursAgo(hours: number): string {
  return new Date(NOW.valueOf() - hours * 3_600_000).toISOString();
}

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    name: 'Deploy',
    path: '.github/workflows/deploy.yml',
    event: 'push',
    status: 'completed',
    conclusion: 'failure',
    head_branch: 'main',
    created_at: hoursAgo(1),
    run_started_at: hoursAgo(1),
    html_url: 'https://github.com/zapPilot/zapEngine/actions/runs/100',
    ...overrides,
  };
}

function fetchFor(runs: unknown[]) {
  return (async () =>
    new Response(JSON.stringify({ workflow_runs: runs }), {
      status: 200,
    })) as typeof fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('github-recent coverage', () => {
  it('falls back to the global fetch when no fetch impl is injected', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ workflow_runs: [] }));
    vi.stubGlobal('fetch', fetchImpl);

    const signals = await collectRecentGithubFailureSignals({
      config: CONFIGURED,
      now: NOW,
    });

    expect(fetchImpl).toHaveBeenCalled();
    expect(signals).toEqual([]);
  });

  it('drops rows that fail to parse while keeping the readable failure', async () => {
    const signals = await collectRecentGithubFailureSignals({
      config: CONFIGURED,
      now: NOW,
      fetchImpl: fetchFor([
        { unexpected: true },
        { ...run(), status: 'in_progress' },
        run(),
      ]),
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.fingerprint).toBe(
      'github-actions:recent-failure/deploy.yml',
    );
  });

  it('reports unknown branch when head_branch is absent', async () => {
    const signals = await collectRecentGithubFailureSignals({
      config: CONFIGURED,
      now: NOW,
      fetchImpl: fetchFor([run({ head_branch: null })]),
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.evidence['branch']).toBeNull();
    expect(signals[0]?.detail).toContain('unknown branch');
  });
});
