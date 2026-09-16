import { afterEach, describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';
import { collectGithubSignals } from './github.js';

const NOW = new Date('2026-08-28T12:00:00.000Z');
const CONFIGURED = readControlCenterConfig({ OPS_GITHUB_TOKEN: 'ops-token' });

function completedRun(conclusion: string | null, startedAt: string) {
  return {
    status: 'completed',
    conclusion,
    created_at: startedAt,
    run_started_at: startedAt,
    html_url: 'https://github.com/zapPilot/zapEngine/actions/runs/1',
  };
}

function runsResponse(runs: unknown[]) {
  return new Response(JSON.stringify({ workflow_runs: runs }), { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unmock('./repo-root.js');
});

describe('github coverage', () => {
  it('falls back to the global fetch when no fetch impl is injected', async () => {
    const fetchImpl = vi.fn(async (url: unknown) => {
      const text = String(url);
      if (text.includes('/contents/.github/schedules.json')) {
        return Response.json([
          {
            name: 'env-drift',
            runtime: 'github-actions',
            entrypoint: '.github/workflows/env-drift.yml',
            schedule_kind: 'cron',
            schedule: '0 3 * * *',
          },
        ]);
      }
      return runsResponse([
        completedRun('success', '2026-08-28T10:00:00.000Z'),
      ]);
    });
    vi.stubGlobal('fetch', fetchImpl);

    const signals = await collectGithubSignals({
      config: CONFIGURED,
      now: NOW,
      registrySource: 'remote-main',
    });

    expect(fetchImpl).toHaveBeenCalled();
    expect(signals[0]?.status).toBe('healthy');
  });

  it('resolves the local registry without an explicit repo root', async () => {
    const fetchImpl = vi.fn(async () =>
      runsResponse([completedRun('success', '2026-08-28T10:00:00.000Z')]),
    ) as unknown as typeof fetch;

    const signals = await collectGithubSignals({
      config: CONFIGURED,
      now: NOW,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalled();
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal.source === 'github-actions')).toBe(
      true,
    );
  });

  it('names a null conclusion without inventing one', async () => {
    const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const root = await mkdtemp(join(tmpdir(), 'cc-github-null-'));
    await mkdir(join(root, '.github'), { recursive: true });
    await writeFile(
      join(root, '.github', 'schedules.json'),
      JSON.stringify([
        {
          name: 'env-drift',
          runtime: 'github-actions',
          entrypoint: '.github/workflows/env-drift.yml',
          schedule_kind: 'cron',
          schedule: '0 3 * * *',
        },
      ]),
    );
    const fetchImpl = (async () =>
      runsResponse([
        completedRun(null, '2026-08-28T10:00:00.000Z'),
        completedRun('success', '2026-08-28T09:00:00.000Z'),
      ])) as unknown as typeof fetch;

    const signals = await collectGithubSignals({
      config: CONFIGURED,
      now: NOW,
      fetchImpl,
      repoRoot: root,
    });

    expect(signals[0]?.status).toBe('degraded');
    expect(signals[0]?.detail).toContain('without a conclusion');
  });
});
