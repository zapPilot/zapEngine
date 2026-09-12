import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';
import { collectGithubSignals } from './github.js';

it('does not read completed-run history for the always-on ops operator', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cc-github-operator-'));
  await mkdir(join(root, '.github'), { recursive: true });
  await writeFile(
    join(root, '.github', 'schedules.json'),
    JSON.stringify([
      {
        name: 'ops-operator',
        runtime: 'github-actions',
        entrypoint: '.github/workflows/ops-operator.yml',
        schedule_kind: 'cron',
        schedule: '*/5 * * * *',
      },
      {
        name: 'env-drift',
        runtime: 'github-actions',
        entrypoint: '.github/workflows/env-drift.yml',
        schedule_kind: 'cron',
        schedule: '17 1 * * *',
      },
    ]),
  );

  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        workflow_runs: [
          {
            status: 'completed',
            conclusion: 'success',
            created_at: '2026-09-12T11:00:00.000Z',
            run_started_at: '2026-09-12T11:00:00.000Z',
            html_url: 'https://github.com/zapPilot/zapEngine/actions/runs/1',
          },
        ],
      }),
      { status: 200 },
    ),
  );

  const signals = await collectGithubSignals({
    config: readControlCenterConfig({ OPS_GITHUB_TOKEN: 'test-token' }),
    now: new Date('2026-09-12T12:00:00.000Z'),
    repoRoot: root,
    fetchImpl,
  });

  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
    '/actions/workflows/env-drift.yml/runs?',
  );
  expect(String(fetchImpl.mock.calls[0]?.[0])).not.toContain('ops-operator.yml');
  expect(signals.map((signal) => signal.fingerprint)).toEqual([
    'github-actions:workflow/env-drift.yml',
  ]);
});
