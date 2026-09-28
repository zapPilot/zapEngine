import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';

vi.mock('./repo-root.js', () => ({
  findRepoRoot: vi.fn(() => '/tmp/cc-no-schedules-root'),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
  };
});

const { collectGithubSignals } = await import('./github.js');

const NOW = new Date('2026-08-28T12:00:00.000Z');
const CONFIGURED = readControlCenterConfig({ OPS_GITHUB_TOKEN: 'ops-token' });

describe('github local root missing schedules', () => {
  it('falls back to remote when schedules.json is absent locally', async () => {
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
      return new Response(
        JSON.stringify({
          workflow_runs: [
            {
              status: 'completed',
              conclusion: 'success',
              created_at: '2026-08-28T10:00:00.000Z',
              run_started_at: '2026-08-28T10:00:00.000Z',
              html_url: 'https://github.com/zapPilot/zapEngine/actions/runs/1',
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const signals = await collectGithubSignals({
      config: CONFIGURED,
      now: NOW,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalled();
    expect(signals[0]?.status).toBe('healthy');
  });
});
