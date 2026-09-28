import { afterEach, describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../../config/env.js';
import { inspectOperationalSignal } from './inspect.js';

const NOW = new Date('2026-09-19T09:00:00.000Z');

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('inspectOperationalSignal global fetch', () => {
  it('falls back to globalThis.fetch when no fetch impl is injected', async () => {
    const fetchImpl = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('/actions/workflows/env-drift.yml/runs?')) {
        return json({
          workflow_runs: [
            {
              id: 44,
              status: 'completed',
              conclusion: 'success',
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
        return json({ jobs: [] });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchImpl);

    const result = await inspectOperationalSignal({
      config: readControlCenterConfig({ OPS_GITHUB_TOKEN: 'ops-token' }),
      fingerprint: 'github-actions:workflow/env-drift.yml',
      now: () => NOW,
    });

    expect(fetchImpl).toHaveBeenCalled();
    expect(result.status).toBe('ok');
  });
});
