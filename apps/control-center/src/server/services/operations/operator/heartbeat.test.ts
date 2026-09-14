import { describe, expect, it, vi } from 'vitest';

import type { OperatorStore } from './store.js';
import { collectOperatorHeartbeatSignal } from './heartbeat.js';

const NOW = new Date('2026-09-12T12:30:00.000Z');

function store(input: {
  observedAt?: string | null;
  state?: 'running' | 'succeeded' | 'failed';
  failureStreak?: number;
  error?: Error;
}): OperatorStore {
  const heartbeat = input.error
    ? vi.fn().mockRejectedValue(input.error)
    : vi.fn().mockResolvedValue(
        input.observedAt === null
          ? null
          : {
              observedAt: input.observedAt ?? NOW.toISOString(),
              actor: 'github-actions',
              state: input.state ?? 'succeeded',
              failureStreak: input.failureStreak ?? 0,
            },
      );
  return {
    rpc: vi.fn(),
    recordHeartbeat: vi.fn(),
    heartbeat,
    history: vi.fn(),
    runtime: vi.fn(),
    renderTargets: vi.fn(),
  } as unknown as OperatorStore;
}

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

describe('operator heartbeat signal', () => {
  it.each([
    [5, 'healthy', 'ops-operator heartbeat is fresh'],
    [12, 'degraded', 'ops-operator heartbeat is delayed'],
    [16, 'critical', 'ops-operator heartbeat is stale'],
  ] as const)('maps a %im successful heartbeat to %s', async (minutes, status, title) => {
    const signal = await collectOperatorHeartbeatSignal(
      store({ observedAt: minutesAgo(minutes) }),
      NOW,
    );

    expect(signal).toMatchObject({
      fingerprint: 'github-actions:workflow/ops-operator.yml',
      source: 'github-actions',
      domain: 'jobs',
      status,
      title,
      evidence: {
        workflow: 'ops-operator.yml',
        heartbeatAt: minutesAgo(minutes),
        heartbeatAgeMinutes: minutes,
        actor: 'github-actions',
        state: 'succeeded',
        failureStreak: 0,
      },
    });
  });

  it('keeps the current retry degraded after one failed cycle', async () => {
    const signal = await collectOperatorHeartbeatSignal(
      store({
        observedAt: minutesAgo(1),
        state: 'running',
        failureStreak: 1,
      }),
      NOW,
    );

    expect(signal.status).toBe('degraded');
    expect(signal.title).toBe(
      'ops-operator is retrying after a failed cycle',
    );
  });

  it('escalates two consecutive cycle failures immediately', async () => {
    const signal = await collectOperatorHeartbeatSignal(
      store({
        observedAt: minutesAgo(1),
        state: 'failed',
        failureStreak: 2,
      }),
      NOW,
    );

    expect(signal.status).toBe('critical');
    expect(signal.title).toBe('ops-operator failed 2 cycles in a row');
  });

  it('degrades when no heartbeat has ever been recorded', async () => {
    const signal = await collectOperatorHeartbeatSignal(
      store({ observedAt: null }),
      NOW,
    );

    expect(signal.status).toBe('degraded');
    expect(signal.fingerprint).toBe(
      'github-actions:workflow/ops-operator.yml',
    );
  });

  it('reports an unknown reading without inventing workflow failure', async () => {
    const signal = await collectOperatorHeartbeatSignal(
      store({ error: new Error('database unavailable') }),
      NOW,
    );

    expect(signal.status).toBe('unknown');
    expect(signal.title).toBe('ops-operator heartbeat unavailable');
    expect(signal.detail).toContain('database unavailable');
  });
});
