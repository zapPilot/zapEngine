import { describe, expect, it } from 'vitest';

import { readControlCenterConfig } from '../../../config/env.js';
import { parseOperationalFingerprint } from './fingerprint.js';
import { inspectOperationalSignal } from './inspect.js';

const NOW = new Date('2026-08-30T08:00:00.000Z');

describe('parseOperationalFingerprint', () => {
  it('preserves slashes inside the signal key', () => {
    expect(
      parseOperationalFingerprint(
        'fly:process-group/from-fed-to-chain-api/render',
      ),
    ).toEqual({
      source: 'fly',
      kind: 'process-group',
      key: 'from-fed-to-chain-api/render',
    });
  });

  it('rejects malformed fingerprints', () => {
    expect(parseOperationalFingerprint('github-actions')).toBeNull();
    expect(parseOperationalFingerprint('github-actions:workflow/')).toBeNull();
  });
});

describe('inspectOperationalSignal', () => {
  it('inspects a failed GitHub workflow with bounded redacted logs', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/actions/workflows/env-drift.yml/runs?')) {
        expect(url).toContain('event=schedule');
        return json({
          workflow_runs: [
            {
              id: 44,
              status: 'completed',
              conclusion: 'failure',
              created_at: '2026-08-30T07:00:00.000Z',
              run_started_at: '2026-08-30T07:00:00.000Z',
              updated_at: '2026-08-30T07:02:00.000Z',
              html_url: 'https://github.com/zapPilot/zapEngine/actions/runs/44',
              head_sha: 'abc123',
              run_attempt: 1,
            },
          ],
        });
      }
      if (url.includes('/actions/runs/44/jobs?')) {
        return json({
          jobs: [
            {
              id: 55,
              name: 'drift',
              status: 'completed',
              conclusion: 'failure',
              started_at: '2026-08-30T07:00:00.000Z',
              completed_at: '2026-08-30T07:02:00.000Z',
              html_url: 'https://github.com/zapPilot/zapEngine/actions/jobs/55',
              steps: [
                {
                  name: 'Compare env',
                  number: 3,
                  status: 'completed',
                  conclusion: 'failure',
                },
              ],
            },
          ],
        });
      }
      if (url.includes('/actions/jobs/55/logs')) {
        return new Response(
          'setup ok\nAuthorization: Bearer super-secret-token-value\nError: SUPABASE_URL is not configured\ncleanup',
        );
      }
      /* jscpd:ignore-start -- parallel test fixture fallback, kept inline for test isolation */
      return new Response('not found', { status: 404 });
    };

    const result = await inspectOperationalSignal({
      config: readControlCenterConfig({ OPS_GITHUB_TOKEN: 'ops-token' }),
      /* jscpd:ignore-end */
      fingerprint: 'github-actions:workflow/env-drift.yml',
      now: () => NOW,
      fetchImpl,
    });

    // jscpd:ignore-start -- shared assertion scaffolding across signal inspection tests
    expect(result.status).toBe('ok');
    expect(result.evidence).toMatchObject({
      workflow: 'env-drift.yml',
      selectedRun: { id: 44, conclusion: 'failure' },
      failedJobs: [
        {
          id: 55,
          failedSteps: [{ name: 'Compare env', conclusion: 'failure' }],
        },
      ],
    });
    // jscpd:ignore-end
    const serialized = JSON.stringify(result);
    expect(serialized).toContain('SUPABASE_URL is not configured');
    expect(serialized).not.toContain('super-secret-token-value');
  });

  it('inspects Sentry project issues without returning request or user payloads', async () => {
    const frames = Array.from({ length: 25 }, (_, index) => ({
      filename: `src/file-${index}.ts`,
      function: `fn${index}`,
      lineNo: index + 1,
      inApp: true,
    }));
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/organizations/zap-pilot/issues/')) {
        return json([
          {
            id: '12',
            shortId: 'ACCOUNT-12',
            title: 'TypeError',
            culprit: 'portfolio.refresh',
            permalink: 'https://sentry.io/issues/12/',
            count: '20',
            userCount: 2,
            firstSeen: '2026-08-30T06:00:00.000Z',
            lastSeen: '2026-08-30T07:50:00.000Z',
            project: { slug: 'account-engine' },
          },
        ]);
      }
      if (url.includes('/issues/12/events/latest/')) {
        return json({
          eventID: 'event-1',
          title: 'TypeError',
          dateCreated: '2026-08-30T07:50:00.000Z',
          environment: 'production',
          platform: 'node',
          release: { version: 'abc123' },
          user: { email: 'must-not-leak@example.com' },
          request: { headers: { Authorization: 'secret' } },
          entries: [
            {
              type: 'exception',
              data: {
                values: [
                  {
                    type: 'TypeError',
                    value: 'Cannot read properties of undefined',
                    stacktrace: { frames },
                  },
                ],
              },
            },
          ],
        });
      }
      /* jscpd:ignore-start -- parallel test fixture fallback, kept inline for test isolation */
      return new Response('not found', { status: 404 });
    };

    const result = await inspectOperationalSignal({
      config: readControlCenterConfig({
        SENTRY_OPS_AUTH_TOKEN: 'sentry-token',
        SENTRY_ORG_SLUG: 'zap-pilot',
      }),
      /* jscpd:ignore-end */
      fingerprint: 'sentry:issues/account-engine',
      now: () => NOW,
      fetchImpl,
    });

    expect(result.status).toBe('ok');
    const serialized = JSON.stringify(result);
    expect(serialized).toContain('Cannot read properties of undefined');
    expect(serialized).not.toContain('must-not-leak@example.com');
    expect(serialized).not.toContain('Authorization');
    const event = result.evidence['sampleEvent'] as {
      exceptions?: Array<{ frames?: unknown[] }>;
    };
    expect(event.exceptions?.[0]?.frames).toHaveLength(20);
  });

  it('inspects Fly process-group state and bounded lifecycle events', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      expect(url).toContain('/apps/from-fed-to-chain-api/machines');
      return json([
        {
          id: 'render-1',
          name: 'render-machine',
          state: 'stopped',
          region: 'iad',
          instance_id: 'instance-1',
          created_at: '2026-08-30T06:00:00.000Z',
          updated_at: '2026-08-30T07:50:00.000Z',
          config: {
            metadata: {
              fly_process_group: 'render',
              secret_material: 'must-not-leak',
            },
            env: { API_KEY: 'must-not-leak' },
          },
          image_ref: {
            repository: 'registry.fly.io/from-fed-to-chain-api',
            digest: 'sha256:abc',
          },
          events: Array.from({ length: 12 }, (_, index) => ({
            type: index === 0 ? 'stop' : 'start',
            status: index === 0 ? 'stopped' : 'started',
            source: 'flyd',
            timestamp: Date.parse('2026-08-30T07:00:00.000Z') + index,
          })),
        },
        {
          id: 'app-1',
          state: 'started',
          region: 'iad',
          config: { metadata: { fly_process_group: 'app' } },
        },
      ]);
    };

    const result = await inspectOperationalSignal({
      config: readControlCenterConfig({ FLY_OPS_TOKEN: 'fly-token' }),
      fingerprint: 'fly:process-group/from-fed-to-chain-api/render',
      now: () => NOW,
      fetchImpl,
    });

    // jscpd:ignore-start -- shared assertion scaffolding across signal inspection tests
    expect(result.status).toBe('ok');
    expect(result.evidence).toMatchObject({
      app: 'from-fed-to-chain-api',
      processGroup: 'render',
      totalMachines: 1,
      machines: [
        {
          id: 'render-1',
          state: 'stopped',
          region: 'iad',
          image: { digest: 'sha256:abc' },
        },
      ],
    });
    // jscpd:ignore-end
    const machines = result.evidence['machines'] as Array<{
      recentEvents: unknown[];
    }>;
    expect(machines[0]?.recentEvents).toHaveLength(8);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('must-not-leak');
    expect(serialized).not.toContain('API_KEY');
  });

  it('returns explicit unsupported evidence for providers without an inspector', async () => {
    const neverFetch: typeof fetch = async () => {
      throw new Error('unsupported providers must not fetch');
    };
    const result = await inspectOperationalSignal({
      config: readControlCenterConfig({}),
      fingerprint: 'posthog:events/product',
      now: () => NOW,
      fetchImpl: neverFetch,
    });

    expect(result).toMatchObject({
      source: null,
      status: 'unsupported',
      evidence: { source: 'posthog', kind: 'events', key: 'product' },
    });
  });
});

// jscpd:ignore-start -- shared test json helper duplicated across operation tests
function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
// jscpd:ignore-end

describe('recent main failure inspection', () => {
  it('selects completed failure behind an active rerun and reports commits without claiming a fix', async () => {
    const seen: string[] = [];
    const result = await inspectOperationalSignal({
      config: readControlCenterConfig({ OPS_GITHUB_TOKEN: 'token' }),
      fingerprint: 'github-actions:recent-failure/release-mobile.yml',
      now: () => NOW,
      fetchImpl: async (resource) => {
        const url = String(resource);
        seen.push(url);
        if (url.includes('/workflows/')) {
          return json({
            workflow_runs: [
              {
                id: 34666854093,
                status: 'in_progress',
                created_at: '2026-09-12T06:00:00Z',
              },
              {
                id: 34666854092,
                status: 'completed',
                conclusion: 'failure',
                created_at: '2026-09-12T02:09:00Z',
                head_sha: 'abc',
              },
            ],
          });
        }
        if (url.includes('/jobs?')) {
          return json({
            jobs: [
              {
                id: 9,
                name: 'build-android',
                status: 'completed',
                conclusion: 'failure',
                steps: [
                  { name: 'Build Android on EAS', conclusion: 'failure' },
                ],
              },
            ],
          });
        }
        if (url.includes('/logs')) {
          return new Response('Error: missing brand-assets dist');
        }
        return json({
          status: 'ahead',
          total_commits: 2,
          html_url: 'https://github.com/zapPilot/zapEngine/compare/abc...main',
          commits: [
            {
              sha: 'def',
              html_url: 'https://github.com/zapPilot/zapEngine/commit/def',
              commit: {
                message: 'Build brand assets (#502)',
                committer: { date: '2026-09-12T05:05:00Z' },
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
        });
      },
    });
    expect(seen[0]).toContain('branch=main');
    expect(result.evidence).toMatchObject({
      selectedRun: { id: 34666854092 },
      failedJobs: [
        {
          name: 'build-android',
          failedSteps: [{ name: 'Build Android on EAS' }],
        },
      ],
      commitsSinceFailure: {
        totalCommits: 2,
        truncated: false,
        commits: [{ prNumber: 502 }, { prNumber: 503 }],
      },
    });
    expect(result.evidence['commitsSinceFailureScope']).toContain(
      'not evidence',
    );
  });
  it('keeps unrelated GitHub kinds unsupported', async () => {
    const result = await inspectOperationalSignal({
      config: readControlCenterConfig({}),
      fingerprint: 'github-actions:recent-runs/repository',
      now: () => NOW,
      fetchImpl: async () => {
        throw new Error('must not fetch');
      },
    });
    expect(result.status).toBe('unsupported');
  });
});
