import { describe, expect, it, vi } from 'vitest';
import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';

import { readControlCenterConfig } from '../../../config/env.js';
import { runOperatorCycle } from './runner.js';
import type { OperatorStore } from './store.js';

const episodeId = '11111111-1111-4111-8111-111111111111';
const localizationId = '22222222-2222-4222-8222-222222222222';
const sha = 'a'.repeat(40);
const config = readControlCenterConfig({
  FLY_OPS_TOKEN: 'test',
  SENTRY_OPS_AUTH_TOKEN: 'test',
});
const fix = {
  incidentId: episodeId,
  rootCause: 'render failure',
  fixSha: sha,
  prNumber: 437,
  issueId: '42',
  machineId: 'machine1',
  localizationId,
  app: 'from-fed-to-chain-api' as const,
  authorizeResolve: true,
};
const now = new Date('2026-09-10T00:20:00Z');

// jscpd:ignore-start -- bounded runner fixtures duplicated for gap coverage isolation
function failedTarget() {
  return {
    episodeId,
    localizationId,
    renderStatus: 'failed',
    renderCompletedAt: '2026-09-10T00:10:00Z',
    renderLeaseExpiresAt: null,
    visualStatus: 'completed',
    visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
    deploymentOpen: true,
  };
}

function completedTarget() {
  return { ...failedTarget(), renderStatus: 'completed' };
}

function runtimeRow() {
  return {
    service: '@zapengine/podcast-pipeline',
    source: 'render',
    recordId: 'run',
    observedAt: '2026-09-10T00:01:00Z',
    correlation: {
      localizationId,
      flyMachineId: 'machine1',
      gitSha: sha,
    },
  };
}

function store(overrides: Record<string, unknown> = {}) {
  return {
    rpc: vi.fn().mockResolvedValue({ state: 'succeeded' }),
    recordHeartbeat: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn(),
    history: vi.fn().mockResolvedValue([]),
    runtime: vi.fn().mockResolvedValue([runtimeRow()]),
    renderTargets: vi.fn().mockResolvedValue([failedTarget()]),
    ...overrides,
  };
}

function operations(overrides: Record<string, unknown> = {}) {
  return {
    getOperations: vi
      .fn()
      .mockResolvedValue({ generatedAt: now.toISOString(), priorities: [] }),
    investigate: vi.fn().mockResolvedValue({ remediation: { blockers: [] } }),
    resolveSentryIssue: vi.fn(),
    ...overrides,
  };
}

function providerFetch() {
  return vi.fn<typeof fetch>().mockImplementation(async (url) => {
    if (String(url).includes('machines/')) {
      return new Response(
        JSON.stringify({
          id: 'machine1',
          state: 'started',
          instance_id: 'instance1',
          config: {
            env: { APP_COMMIT_SHA: sha },
            metadata: { fly_release_id: 'release1' },
          },
          events: [
            {
              status: 'started',
              timestamp: Date.parse('2026-09-10T00:00:00Z'),
            },
          ],
        }),
      );
    }
    if (String(url).includes('events/latest')) {
      return new Response(
        JSON.stringify({ contexts: { opsCorrelation: { localizationId } } }),
      );
    }
    return new Response(JSON.stringify([]));
  });
}
// jscpd:ignore-end

describe('runOperatorCycle coverage gaps', () => {
  it('resolves the Sentry issue after an authorized verified observation', async () => {
    const persistence = store({
      history: vi.fn().mockResolvedValue([
        {
          id: episodeId,
          fingerprint: 'incident',
          state: 'blocked',
          correlation: { localizationId },
          fix,
        },
      ]),
      renderTargets: vi.fn().mockResolvedValue([completedTarget()]),
    });
    const ops = operations();
    vi.stubGlobal('fetch', providerFetch());
    try {
      const result = await runOperatorCycle({
        operations: ops,
        store: persistence as unknown as OperatorStore,
        config,
        actor: 'test',
        mutationsEnabled: true,
      });

      expect(result.state).toBe('verified');
      expect(ops.resolveSentryIssue).toHaveBeenCalledWith(
        '42',
        expect.stringContaining('verification passed'),
      );
      expect(persistence.rpc.mock.calls.map((call) => call[0])).toEqual([
        'ops_record_verification',
        'ops_record_cycle',
      ]);
      expect(persistence.rpc).toHaveBeenCalledWith(
        'ops_record_cycle',
        expect.objectContaining({
          p_decision: 'Production recovery verified.',
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('stays idle-shaped without a target by recording the snapshot fingerprint', async () => {
    const fingerprint = 'sentry:issues/podcast-pipeline';
    const persistence = store({
      renderTargets: vi.fn().mockResolvedValue([]),
    });
    const ops = operations({
      getOperations: vi.fn().mockResolvedValue({
        generatedAt: now.toISOString(),
        priorities: [{ signal: { fingerprint } }],
      }),
    });

    const result = await runOperatorCycle({
      operations: ops,
      store: persistence as unknown as OperatorStore,
      config,
      actor: 'test',
      mutationsEnabled: true,
    });

    expect(result).toEqual({ state: 'needs_human', fingerprint, action: null });
    expect(persistence.rpc).toHaveBeenCalledWith(
      'ops_record_cycle',
      expect.objectContaining({
        p_correlation: {},
        p_decision: 'No autonomous action is allowed.',
      }),
    );
  });

  it('appends remediation blockers to the render action instead of retrying', async () => {
    const persistence = store();
    const blocker = 'Upstream deploy is still rolling out.';
    const ops = operations({
      investigate: vi.fn().mockResolvedValue({
        remediation: { blockers: [blocker] },
      }),
    });

    const result = await runOperatorCycle({
      operations: ops,
      store: persistence as unknown as OperatorStore,
      config,
      actor: 'test',
      mutationsEnabled: true,
    });

    expect(result.state).toBe('needs_human');
    expect(result).toMatchObject({
      action: { allowed: false, blockers: expect.arrayContaining([blocker]) },
    });
    expect(persistence.rpc).toHaveBeenCalledTimes(1);
  });

  it('escalates when the bounded render retry reports a non-success state', async () => {
    const rpc = vi.fn(async (name: string) =>
      name === 'ops_retry_render'
        ? { state: 'failed' }
        : { state: 'succeeded' },
    );
    const persistence = store({ rpc });
    const ops = operations();

    const result = await runOperatorCycle({
      operations: ops,
      store: persistence as unknown as OperatorStore,
      config,
      actor: 'test',
      mutationsEnabled: true,
    });

    expect(result).toMatchObject({ state: 'needs_human' });
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      'ops_record_cycle',
      'ops_retry_render',
    ]);
  });
});
