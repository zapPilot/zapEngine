import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';

vi.mock('./repo-root.js', () => ({
  findRepoRoot: vi.fn(() => {
    throw new Error('no workspace above');
  }),
}));

const { collectGithubSignals } = await import('./github.js');

const NOW = new Date('2026-08-28T12:00:00.000Z');
const CONFIGURED = readControlCenterConfig({ OPS_GITHUB_TOKEN: 'ops-token' });

describe('github local root fallback', () => {
  it('falls back to the remote registry when the local root cannot be found', async () => {
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
      return Response.json({
        workflow_runs: [
          {
            status: 'completed',
            conclusion: 'success',
            created_at: '2026-08-28T10:00:00.000Z',
            run_started_at: '2026-08-28T10:00:00.000Z',
            html_url: 'https://github.com/zapPilot/zapEngine/actions/runs/1',
          },
        ],
      });
    }) as unknown as typeof fetch;

    const signals = await collectGithubSignals({
      config: CONFIGURED,
      now: NOW,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalled();
    expect(signals[0]?.status).toBe('healthy');
    expect(signals[0]?.fingerprint).toBe(
      'github-actions:workflow/env-drift.yml',
    );
  });
});
