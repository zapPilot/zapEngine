import { describe, expect, it, vi } from 'vitest';
import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';
import { readControlCenterConfig } from '../../../config/env.js';
import { runOperatorCycle } from './runner.js';
import { observeRecovery } from './observe.js';
import { createOperatorStore } from './store.js';

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
  authorizeResolve: false,
};
const now = new Date('2026-09-10T00:20:00Z');
const target = {
  episodeId,
  localizationId,
  renderStatus: 'failed',
  renderCompletedAt: '2026-09-10T00:10:00Z',
  renderLeaseExpiresAt: null,
  visualStatus: 'completed',
  visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
  deploymentOpen: true,
};
function store() {
  return {
    rpc: vi.fn().mockResolvedValue({ state: 'succeeded' }),
    recordHeartbeat: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue({
      observedAt: now.toISOString(),
      actor: 'test',
    }),
    history: vi.fn().mockResolvedValue([]),
    runtime: vi.fn().mockResolvedValue([
      {
        service: '@zapengine/podcast-pipeline',
        source: 'render',
        recordId: 'run',
        observedAt: '2026-09-10T00:01:00Z',
        correlation: {
          localizationId,
          flyMachineId: 'machine1',
          gitSha: sha,
        },
      },
    ]),
    renderTargets: vi.fn().mockResolvedValue([target]),
  };
}
function operations() {
  return {
    getOperations: vi
      .fn()
      .mockResolvedValue({ generatedAt: now.toISOString(), priorities: [] }),
    investigate: vi.fn().mockResolvedValue({ remediation: { blockers: [] } }),
    resolveSentryIssue: vi.fn(),
  };
}
function provider(
  events: unknown[] = [],
  machineState = 'started',
  truncated = false,
) {
  return vi.fn<typeof fetch>().mockImplementation(async (url) => {
    if (String(url).includes('machines/')) {
      return new Response(
        JSON.stringify({
          id: 'machine1',
          state: machineState,
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
    return new Response(JSON.stringify(events), {
      headers: truncated ? { link: '<next>; rel="next"; results="true"' } : {},
    });
  });
}
describe('operator cycle', () => {
  it('writes intent before one allowed mutation', async () => {
    const persistence = store();
    const result = await runOperatorCycle({
      operations: operations(),
      store: persistence,
      config,
      actor: 'test',
      mutationsEnabled: true,
    });
    expect(result.state).toBe('observing');
    expect(persistence.recordHeartbeat).toHaveBeenCalledWith('test');
    expect(persistence.rpc.mock.calls.map((call) => call[0])).toEqual([
      'ops_record_cycle',
      'ops_retry_render',
    ]);
  });
  it('records policy rejection and never calls mutation when dark or previously attempted', async () => {
    for (const enabled of [false, true]) {
      const persistence = store();
      if (enabled) {
        persistence.history.mockResolvedValue([
          { actions: [{ state: 'unknown' }] },
        ]);
      }
      const result = await runOperatorCycle({
        operations: operations(),
        store: persistence,
        config,
        actor: 'test',
        mutationsEnabled: enabled,
      });
      expect(result.state).toBe('needs_human');
      expect(persistence.recordHeartbeat).toHaveBeenCalledWith('test');
      expect(persistence.rpc).toHaveBeenCalledTimes(1);
    }
  });
  it('records liveness even when there is no incident', async () => {
    const persistence = store();
    persistence.renderTargets.mockResolvedValue([]);
    expect(
      (
        await runOperatorCycle({
          operations: operations(),
          store: persistence,
          config,
          actor: 'test',
          mutationsEnabled: true,
        })
      ).state,
    ).toBe('idle');
    expect(persistence.recordHeartbeat).toHaveBeenCalledWith('test');
    expect(persistence.rpc).not.toHaveBeenCalled();
  });
  it('never retries a transport result it cannot classify', async () => {
    const persistence = store();
    persistence.rpc
      .mockResolvedValueOnce(episodeId)
      .mockRejectedValueOnce(new Error('timeout'));
    await expect(
      runOperatorCycle({
        operations: operations(),
        store: persistence,
        config,
        actor: 'test',
        mutationsEnabled: true,
      }),
    ).rejects.toThrow('timeout');
    expect(persistence.recordHeartbeat).toHaveBeenCalledWith('test');
    expect(persistence.rpc).toHaveBeenCalledTimes(2);
  });
});
describe('production observer', () => {
  it('verifies the exact deployed job using fresh provider reads', async () => {
    const persistence = store();
    persistence.renderTargets.mockResolvedValue([
      { ...target, renderStatus: 'completed' },
    ]);
    const result = await observeRecovery({
      store: persistence,
      config,
      fix,
      now,
      fetchImpl: provider(),
    });
    expect(result.verified).toBe(true);
    expect(persistence.rpc).toHaveBeenCalledWith(
      'ops_record_verification',
      expect.objectContaining({ p_verified: true }),
    );
  });
  it.each([
    'events',
    'truncated',
    'queue',
    'runtime',
    'identity',
    'credentials',
    'transport',
  ])('fails closed when %s evidence is incomplete', async (failure) => {
    const persistence = store();
    persistence.renderTargets.mockResolvedValue([
      { ...target, renderStatus: 'completed' },
    ]);
    if (failure === 'queue') {
      persistence.renderTargets.mockResolvedValue([target]);
    }
    if (failure === 'identity') {
      persistence.runtime.mockResolvedValue([]);
    }
    const fetchImpl =
      failure === 'transport'
        ? vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'))
        : provider(
            failure === 'events' ? [{ dateCreated: now.toISOString() }] : [],
            failure === 'runtime' ? 'stopped' : 'started',
            failure === 'truncated',
          );
    const result = await observeRecovery({
      store: persistence,
      config: failure === 'credentials' ? readControlCenterConfig({}) : config,
      fix,
      now,
      fetchImpl,
    });
    expect(result.verified).toBe(false);
  });
  it('blocks when the fixed SHA is not active or observation is too short', async () => {
    const persistence = store();
    persistence.renderTargets.mockResolvedValue([
      { ...target, renderStatus: 'completed' },
    ]);
    expect(
      (
        await observeRecovery({
          store: persistence,
          config,
          fix: { ...fix, fixSha: 'b'.repeat(40) },
          now,
          fetchImpl: provider(),
        })
      ).verified,
    ).toBe(false);
    expect(
      (
        await observeRecovery({
          store: persistence,
          config,
          fix,
          now: new Date('2026-09-10T00:05:00Z'),
          fetchImpl: provider(),
        })
      ).verified,
    ).toBe(false);
  });
});
it('refuses unconfigured durable storage', async () => {
  await expect(
    createOperatorStore(readControlCenterConfig({})).history(),
  ).rejects.toThrow('not configured');
});

it('escalates a completed action without invented fix identity', async () => {
  const persistence = store();
  persistence.history.mockResolvedValue([
    {
      id: episodeId,
      fingerprint: 'incident',
      state: 'deployed_observing',
      correlation: { localizationId },
    },
  ]);
  const ops = operations();
  const result = await runOperatorCycle({
    operations: ops,
    store: persistence,
    config,
    actor: 'test',
    mutationsEnabled: true,
  });
  expect(result.state).toBe('needs_human');
  expect(persistence.recordHeartbeat).toHaveBeenCalledWith('test');
  expect(ops.getOperations).not.toHaveBeenCalled();
  expect(persistence.rpc.mock.calls.map((call) => call[0])).toEqual([
    'ops_record_verification',
    'ops_record_cycle',
  ]);
});

it('continues a registered observation instead of starting another repair', async () => {
  const persistence = store();
  persistence.history.mockResolvedValue([
    {
      id: episodeId,
      fingerprint: 'incident',
      state: 'blocked',
      correlation: { localizationId },
      fix,
    },
  ]);
  const ops = operations();
  const result = await runOperatorCycle({
    operations: ops,
    store: persistence,
    config: readControlCenterConfig({}),
    actor: 'test',
    mutationsEnabled: true,
  });
  expect(result.state).toBe('observing');
  expect(persistence.recordHeartbeat).toHaveBeenCalledWith('test');
  expect(ops.getOperations).not.toHaveBeenCalled();
  expect(persistence.rpc.mock.calls.map((call) => call[0])).toEqual([
    'ops_record_verification',
    'ops_record_cycle',
  ]);
});
