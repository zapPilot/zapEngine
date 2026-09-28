import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../../config/env.js';
import { observeRecovery } from './observe.js';
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
  authorizeResolve: false,
};
const now = new Date('2026-09-10T00:20:00Z');
const startedAt = '2026-09-10T00:00:00Z';

// jscpd:ignore-start -- bounded observer fixtures duplicated for gap coverage isolation
function completedTarget() {
  return {
    episodeId,
    localizationId,
    renderStatus: 'completed',
    renderCompletedAt: '2026-09-10T00:10:00Z',
    renderLeaseExpiresAt: null,
    visualStatus: 'completed',
    visualVersion: 'current',
    deploymentOpen: true,
  };
}

function store() {
  return {
    rpc: vi.fn().mockResolvedValue({ state: 'succeeded' }),
    recordHeartbeat: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn(),
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
    renderTargets: vi.fn().mockResolvedValue([completedTarget()]),
  };
}

function provider(
  machine: unknown,
  sentryLocalization = localizationId,
  events: unknown[] = [],
) {
  return vi.fn<typeof fetch>().mockImplementation(async (url) => {
    if (String(url).includes('machines/')) {
      return new Response(JSON.stringify(machine));
    }
    if (String(url).includes('events/latest')) {
      return new Response(
        JSON.stringify({
          contexts: { opsCorrelation: { localizationId: sentryLocalization } },
        }),
      );
    }
    return new Response(JSON.stringify(events));
  });
}

function machine(events: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    id: 'machine1',
    state: 'started',
    instance_id: 'instance1',
    config: {
      env: { APP_COMMIT_SHA: sha },
      metadata: { fly_release_id: 'release1' },
    },
    events,
    ...overrides,
  };
}
// jscpd:ignore-end

describe('observeRecovery coverage gaps', () => {
  it('sorts competing started events and observes from the latest boot', async () => {
    const persistence = store();
    const latest = '2026-09-10T00:00:30Z';
    const result = await observeRecovery({
      store: persistence as unknown as OperatorStore,
      config,
      fix,
      now,
      fetchImpl: provider(
        machine([
          { status: 'started', timestamp: Date.parse(startedAt) },
          { status: 'started', timestamp: Date.parse(latest) },
        ]),
      ),
    });

    expect(result.verified).toBe(true);
    expect(persistence.rpc).toHaveBeenCalledWith(
      'ops_record_verification',
      expect.objectContaining({
        p_verified: true,
        p_evidence: expect.objectContaining({
          activeAt: new Date(latest).toISOString(),
        }),
      }),
    );
  });

  it.each([
    [
      'no started event',
      [{ status: 'exited', timestamp: Date.parse(startedAt) }],
      {},
    ],
    [
      'missing release',
      [{ status: 'started', timestamp: Date.parse(startedAt) }],
      { config: { metadata: {} } },
    ],
    [
      'machine mismatch',
      [{ status: 'started', timestamp: Date.parse(startedAt) }],
      { id: 'machine9' },
    ],
  ])(
    'fails closed when runtime identity is incomplete: %s',
    async (_label, events, overrides) => {
      const persistence = store();
      const result = await observeRecovery({
        store: persistence as unknown as OperatorStore,
        config,
        fix,
        now,
        fetchImpl: provider(machine(events, overrides)),
      });

      expect(result).toEqual({
        verified: false,
        blockers: ['Production verification is unavailable or incomplete.'],
      });
      expect(persistence.rpc).toHaveBeenCalledWith(
        'ops_record_verification',
        expect.objectContaining({ p_verified: false, p_evidence: {} }),
      );
    },
  );

  it('fails closed when Sentry attests a different job', async () => {
    const persistence = store();
    const result = await observeRecovery({
      store: persistence as unknown as OperatorStore,
      config,
      fix,
      now,
      fetchImpl: provider(
        machine([{ status: 'started', timestamp: Date.parse(startedAt) }]),
        '33333333-3333-4333-8333-333333333333',
      ),
    });

    expect(result.verified).toBe(false);
    expect(persistence.rpc).toHaveBeenCalledWith(
      'ops_record_verification',
      expect.objectContaining({ p_verified: false }),
    );
  });

  it('verifies through the global fetch when no fetch implementation is passed', async () => {
    const persistence = store();
    const stub = provider(
      machine([{ status: 'started', timestamp: Date.parse(startedAt) }]),
    );
    vi.stubGlobal('fetch', stub);
    try {
      const result = await observeRecovery({
        store: persistence as unknown as OperatorStore,
        config,
        fix,
        now,
      });

      expect(result.verified).toBe(true);
      expect(stub.mock.calls.length).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
