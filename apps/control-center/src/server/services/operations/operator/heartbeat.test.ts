import { describe, expect, it, vi } from 'vitest';

import type { OperatorStore } from './store.js';
import { collectOperatorHeartbeatSignal } from './heartbeat.js';

const NOW = new Date('2026-09-12T12:30:00.000Z');

function store(input: {
  observedAt?: string | null;
  state?: 'running' | 'succeeded' | 'failed';
  failureStreak?: number;
  cadenceMinutes?: number | null;
  sourceSha?: string | null;
  runId?: string | null;
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
              cadenceMinutes:
                input.cadenceMinutes === undefined ? 240 : input.cadenceMinutes,
              sourceSha: input.sourceSha ?? 'current-sha',
              runId: input.runId ?? '12345',
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
  // Thresholds are 8h and 12h (two and three four-hour cadences), and the
  // comparisons are strict, so the interior values stay clear of both edges
  // and the paired boundary rows below pin which side of each edge the
  // equality case and the first minute past it fall on.
  it.each([
    [30, 'healthy', 'ops-operator heartbeat is fresh'],
    [480, 'healthy', 'ops-operator heartbeat is fresh'],
    [481, 'degraded', 'ops-operator heartbeat is delayed'],
    [600, 'degraded', 'ops-operator heartbeat is delayed'],
    [720, 'degraded', 'ops-operator heartbeat is delayed'],
    [721, 'critical', 'ops-operator heartbeat is stale'],
    [800, 'critical', 'ops-operator heartbeat is stale'],
  ] as const)(
    'maps a %im successful heartbeat to %s',
    async (minutes, status, title) => {
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
    },
  );

  it('degrades a fresh legacy heartbeat that cannot attest the current schedule config', async () => {
    const signal = await collectOperatorHeartbeatSignal(
      store({ observedAt: minutesAgo(30), cadenceMinutes: null }),
      NOW,
    );

    expect(signal).toMatchObject({
      status: 'degraded',
      title: 'ops-operator heartbeat cadence provenance is missing',
      evidence: { cadenceMinutes: null },
    });
  });

  it('degrades a fresh heartbeat produced by a superseded cadence', async () => {
    const signal = await collectOperatorHeartbeatSignal(
      store({ observedAt: minutesAgo(30), cadenceMinutes: 60 }),
      NOW,
    );

    expect(signal).toMatchObject({
      status: 'degraded',
      title: 'ops-operator heartbeat comes from a different schedule',
      evidence: { cadenceMinutes: 60 },
    });
    expect(signal.detail).toContain('60-minute cadence');
    expect(signal.detail).toContain('every 240 minutes');
  });

  // A cadence mismatch only degrades, so it must not be able to mask a
  // scheduler that has stopped altogether.
  it('keeps a superseded-cadence heartbeat critical once it is stale', async () => {
    const signal = await collectOperatorHeartbeatSignal(
      store({ observedAt: minutesAgo(721), cadenceMinutes: 60 }),
      NOW,
    );

    expect(signal).toMatchObject({
      status: 'critical',
      title: 'ops-operator heartbeat is stale',
      evidence: { cadenceMinutes: 60, heartbeatAgeMinutes: 721 },
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
    expect(signal.title).toBe('ops-operator is retrying after a failed cycle');
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

  it('keeps a fresh running cycle critical when it follows two failed cycles', async () => {
    const signal = await collectOperatorHeartbeatSignal(
      store({
        observedAt: minutesAgo(1),
        state: 'running',
        failureStreak: 2,
      }),
      NOW,
    );

    expect(signal).toMatchObject({
      status: 'critical',
      title: 'ops-operator failed 2 cycles in a row',
      evidence: {
        state: 'running',
        failureStreak: 2,
      },
    });
    expect(signal.detail).toContain('after 2 consecutive failed cycles');
  });

  it('reports an invalid stored timestamp without inventing heartbeat age', async () => {
    const signal = await collectOperatorHeartbeatSignal(
      store({ observedAt: 'not-a-timestamp' }),
      NOW,
    );

    expect(signal).toMatchObject({
      status: 'unknown',
      title: 'ops-operator heartbeat is invalid',
      evidence: {
        heartbeatAt: 'not-a-timestamp',
        heartbeatAgeMinutes: null,
        actor: 'github-actions',
        state: 'succeeded',
        failureStreak: 0,
      },
    });
    expect(signal.detail).toContain('not-a-timestamp');
  });

  it('degrades when no heartbeat has ever been recorded', async () => {
    const signal = await collectOperatorHeartbeatSignal(
      store({ observedAt: null }),
      NOW,
    );

    expect(signal.status).toBe('degraded');
    expect(signal.fingerprint).toBe('github-actions:workflow/ops-operator.yml');
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
