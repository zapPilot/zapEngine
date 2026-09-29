import { describe, expect, it } from 'vitest';

import { readControlCenterConfig } from '../../../config/env.js';
import { inspectGithubSignal } from './github.js';

const NOW = new Date('2026-09-19T09:00:00.000Z');

function inspect(
  kind: string,
  key: string,
  fetchImpl: typeof fetch,
): ReturnType<typeof inspectGithubSignal> {
  return inspectGithubSignal({
    config: readControlCenterConfig({ OPS_GITHUB_TOKEN: 'ops-token' }),
    fingerprint: `github-actions:${kind}/${key}`,
    parsed: { source: 'github-actions', kind, key },
    inspectedAt: NOW,
    fetchImpl,
  });
}

// jscpd:ignore-start -- shared test json helper duplicated across operation tests
function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
// jscpd:ignore-end

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: 44,
    status: 'completed',
    conclusion: 'failure',
    created_at: '2026-09-18T07:00:00.000Z',
    run_started_at: '2026-09-18T07:00:00.000Z',
    updated_at: '2026-09-18T07:02:00.000Z',
    html_url: 'https://github.com/zapPilot/zapEngine/actions/runs/44',
    head_sha: 'abc123',
    run_attempt: 1,
    ...overrides,
  };
}

function comparison(commits: unknown[], totalCommits: number): Response {
  return json({
    status: 'ahead',
    total_commits: totalCommits,
    html_url: 'https://github.com/zapPilot/zapEngine/compare/abc123...main',
    commits,
  });
}

function failedJob(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: 'drift',
    status: 'completed',
    conclusion: 'failure',
    started_at: '2026-09-18T07:00:00.000Z',
    completed_at: '2026-09-18T07:02:00.000Z',
    html_url: `https://github.com/zapPilot/zapEngine/actions/jobs/${id}`,
    steps: [{ name: 'Compare env', conclusion: 'failure' }],
    ...overrides,
  };
}

describe('inspectGithubSignal coverage', () => {
  it('reports unavailable without fetching when the token is unset', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('missing tokens must not fetch');
    };

    const result = await inspectGithubSignal({
      config: readControlCenterConfig({}),
      fingerprint: 'github-actions:workflow/env-drift.yml',
      parsed: {
        source: 'github-actions',
        kind: 'workflow',
        key: 'env-drift.yml',
      },
      inspectedAt: NOW,
      fetchImpl,
    });

    expect(result.status).toBe('unavailable');
    expect(result.summary).toContain('OPS_GITHUB_TOKEN is unset');
    expect(result.gaps).toEqual([
      { source: 'github-actions', reason: 'OPS_GITHUB_TOKEN is unset.' },
    ]);
  });

  it('reports not-found when the workflow has no runs', async () => {
    const result = await inspect('workflow', 'env-drift.yml', async () =>
      json({ workflow_runs: [] }),
    );

    expect(result.status).toBe('not-found');
    expect(result.summary).toContain(
      'No readable matching runs were found for env-drift.yml.',
    );
    expect(result.evidence).toMatchObject({ workflow: 'env-drift.yml' });
  });

  it('reports not-found when every run row is unreadable', async () => {
    const result = await inspect('workflow', 'env-drift.yml', async () =>
      json({ workflow_runs: [{ unexpected: 'row' }] }),
    );

    expect(result.status).toBe('not-found');
  });

  it('skips unreadable run rows and inspects the readable run', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/actions/workflows/')) {
        return json({ workflow_runs: [{ unexpected: 'row' }, run()] });
      }
      if (url.includes('/jobs?')) {
        return json({ jobs: [] });
      }
      if (url.includes('/compare/')) {
        return comparison([], 0);
      }
      throw new Error(`unexpected request: ${url}`);
    };

    const result = await inspect('workflow', 'env-drift.yml', fetchImpl);

    expect(result.status).toBe('ok');
    expect(result.evidence).toMatchObject({ selectedRun: { id: 44 } });
    expect(result.evidence['recentRuns']).toHaveLength(1);
  });

  it('selects the newest in-progress run when nothing completed', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/actions/workflows/')) {
        return json({
          workflow_runs: [
            run({
              id: 45,
              status: 'in_progress',
              conclusion: null,
              head_sha: null,
            }),
          ],
        });
      }
      if (url.includes('/jobs?')) {
        return json({ jobs: [] });
      }
      throw new Error(`unexpected request: ${url}`);
    };

    const result = await inspect('workflow', 'env-drift.yml', fetchImpl);

    expect(result.status).toBe('ok');
    expect(result.evidence).toMatchObject({
      selectedRun: { id: 45, status: 'in_progress' },
      commitsSinceFailure: null,
    });
    expect(result.summary).toContain('run 45 (in_progress)');
  });

  it('falls back to the newest completed run when no run failed', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/actions/workflows/')) {
        return json({
          workflow_runs: [run({ id: 46, conclusion: 'success' })],
        });
      }
      if (url.includes('/jobs?')) {
        return json({ jobs: [] });
      }
      throw new Error(`unexpected request: ${url}`);
    };

    const result = await inspect('workflow', 'env-drift.yml', fetchImpl);

    expect(result.evidence).toMatchObject({
      selectedRun: { id: 46, conclusion: 'success' },
      commitsSinceFailure: null,
    });
  });

  it('falls back to the newest completed run when recent wrappers are not decisive', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/actions/workflows/')) {
        return json({
          workflow_runs: [
            run({ id: 91, conclusion: 'cancelled', head_sha: 'cancelled-sha' }),
          ],
        });
      }
      if (url.includes('/jobs?')) {
        return json({ jobs: [] });
      }
      if (url.includes('/compare/')) {
        return comparison([], 0);
      }
      throw new Error(`unexpected request: ${url}`);
    };

    const result = await inspect(
      'recent-failure',
      'deploy-vercel.yml',
      fetchImpl,
    );

    expect(result.evidence).toMatchObject({
      selectedRun: { id: 91, conclusion: 'cancelled' },
      commitsSinceFailure: { totalCommits: 0, truncated: false },
    });
  });

  it('falls back to the newest run when no recent run completed', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/actions/workflows/')) {
        return json({
          workflow_runs: [
            run({
              id: 92,
              status: 'in_progress',
              conclusion: null,
              head_sha: null,
            }),
          ],
        });
      }
      if (url.includes('/jobs?')) {
        return json({ jobs: [] });
      }
      throw new Error(`unexpected request: ${url}`);
    };

    const result = await inspect(
      'recent-failure',
      'deploy-vercel.yml',
      fetchImpl,
    );

    expect(result.evidence).toMatchObject({
      selectedRun: { id: 92, status: 'in_progress' },
      commitsSinceFailure: null,
    });
    expect(result.summary).toContain('run 92 (in_progress)');
  });

  it('marks the log excerpt unavailable when the log download fails', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/actions/workflows/')) {
        return json({ workflow_runs: [run()] });
      }
      if (url.includes('/actions/jobs/55/logs')) {
        return new Response('denied', { status: 403 });
      }
      if (url.includes('/jobs?')) {
        return json({ jobs: [failedJob(55)] });
      }
      if (url.includes('/compare/')) {
        return comparison([], 0);
      }
      throw new Error(`unexpected request: ${url}`);
    };

    const result = await inspect('workflow', 'env-drift.yml', fetchImpl);
    const jobs = result.evidence['failedJobs'] as Array<{
      logExcerpt: string;
    }>;

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.logExcerpt).toContain('log unavailable');
    expect(jobs[0]?.logExcerpt).toContain('403');
  });

  it('drops unreadable job rows and keeps the readable failure', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/actions/workflows/')) {
        return json({ workflow_runs: [run()] });
      }
      if (url.includes('/actions/jobs/56/logs')) {
        return new Response('Error: SUPABASE_URL is not configured');
      }
      if (url.includes('/jobs?')) {
        return json({ jobs: [{ unexpected: 'job' }, failedJob(56)] });
      }
      if (url.includes('/compare/')) {
        return comparison([], 0);
      }
      throw new Error(`unexpected request: ${url}`);
    };

    const result = await inspect('workflow', 'env-drift.yml', fetchImpl);

    expect(result.evidence['failedJobs']).toHaveLength(1);
    expect(result.evidence).toMatchObject({
      failedJobs: [{ id: 56, name: 'drift' }],
    });
  });

  it('reports a trailing excerpt when no log line matches an error', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/actions/workflows/')) {
        return json({ workflow_runs: [run()] });
      }
      if (url.includes('/actions/jobs/57/logs')) {
        return new Response(
          'setup complete\nall checks passed\nworkspace clean',
        );
      }
      if (url.includes('/jobs?')) {
        return json({ jobs: [failedJob(57)] });
      }
      if (url.includes('/compare/')) {
        return comparison([], 0);
      }
      throw new Error(`unexpected request: ${url}`);
    };

    const result = await inspect('workflow', 'env-drift.yml', fetchImpl);
    const jobs = result.evidence['failedJobs'] as Array<{
      logExcerpt: string;
    }>;

    expect(jobs[0]?.logExcerpt).toContain('workspace clean');
  });

  it('maps a failed job without step detail to empty failed steps', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/actions/workflows/')) {
        return json({ workflow_runs: [run()] });
      }
      if (url.includes('/actions/jobs/58/logs')) {
        return new Response('Error: boom');
      }
      if (url.includes('/jobs?')) {
        return json({
          jobs: [
            {
              id: 58,
              name: 'drift',
              status: 'completed',
              conclusion: 'failure',
            },
          ],
        });
      }
      if (url.includes('/compare/')) {
        return comparison([], 0);
      }
      throw new Error(`unexpected request: ${url}`);
    };

    const result = await inspect('workflow', 'env-drift.yml', fetchImpl);

    expect(result.evidence).toMatchObject({
      failedJobs: [{ id: 58, failedSteps: [] }],
    });
  });

  it('keeps only failed steps and tolerates malformed step rows', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/actions/workflows/')) {
        return json({ workflow_runs: [run()] });
      }
      if (url.includes('/actions/jobs/59/logs')) {
        return new Response('Error: boom');
      }
      if (url.includes('/jobs?')) {
        return json({
          jobs: [
            failedJob(59, {
              steps: [
                { unexpected: 'step' },
                { name: 'Lint', conclusion: 'success' },
                { name: 'Test', conclusion: 'failure' },
              ],
            }),
          ],
        });
      }
      if (url.includes('/compare/')) {
        return comparison([], 0);
      }
      throw new Error(`unexpected request: ${url}`);
    };

    const result = await inspect('workflow', 'env-drift.yml', fetchImpl);
    const jobs = result.evidence['failedJobs'] as Array<{
      failedSteps: unknown[];
    }>;

    expect(jobs[0]?.failedSteps).toHaveLength(1);
    expect(result.evidence).toMatchObject({
      failedJobs: [
        { id: 59, failedSteps: [{ name: 'Test', conclusion: 'failure' }] },
      ],
    });
  });

  it('reports unavailable compare context when the failed run has no head SHA', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/actions/workflows/')) {
        return json({ workflow_runs: [run({ head_sha: null })] });
      }
      if (url.includes('/jobs?')) {
        return json({ jobs: [] });
      }
      throw new Error(`unexpected request: ${url}`);
    };

    const result = await inspect('workflow', 'env-drift.yml', fetchImpl);

    expect(result.evidence).toMatchObject({
      commitsSinceFailure: {
        unavailable: 'Failed run has no head SHA.',
      },
    });
  });

  it('parses commit subjects without pull-request references', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/actions/workflows/')) {
        return json({ workflow_runs: [run()] });
      }
      if (url.includes('/jobs?')) {
        return json({ jobs: [] });
      }
      if (url.includes('/compare/')) {
        return comparison(
          [
            {
              sha: 'def',
              html_url: 'https://github.com/zapPilot/zapEngine/commit/def',
              commit: {
                message: 'Fix flaky test',
                committer: { date: '2026-09-18T05:05:00Z' },
              },
            },
            {
              sha: 'ghi',
              html_url: 'https://github.com/zapPilot/zapEngine/commit/ghi',
              commit: {
                message: 'Merge pull request #503 from zapPilot/fix',
                committer: null,
              },
            },
          ],
          9,
        );
      }
      throw new Error(`unexpected request: ${url}`);
    };

    const result = await inspect('workflow', 'env-drift.yml', fetchImpl);

    expect(result.evidence).toMatchObject({
      commitsSinceFailure: {
        totalCommits: 9,
        truncated: true,
        commits: [
          {
            sha: 'def',
            subject: 'Fix flaky test',
            prNumber: null,
            committedAt: '2026-09-18T05:05:00Z',
          },
          { sha: 'ghi', prNumber: 503, committedAt: null },
        ],
      },
    });
  });

  it('records a null run url when the run has no html_url', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/actions/workflows/')) {
        return json({
          workflow_runs: [run({ id: 47, html_url: null })],
        });
      }
      if (url.includes('/jobs?')) {
        return json({ jobs: [] });
      }
      if (url.includes('/compare/')) {
        return comparison([], 0);
      }
      throw new Error(`unexpected request: ${url}`);
    };

    const result = await inspect('workflow', 'env-drift.yml', fetchImpl);

    expect(result.status).toBe('ok');
    expect(result.entities).toContainEqual({
      type: 'github-run',
      id: '47',
      url: null,
    });
  });
});
