import { describe, expect, it, vi } from 'vitest';

import { collectOperatorHeartbeatSignal } from './heartbeat.js';
import type { OperatorStore } from './store.js';

const NOW = new Date('2026-09-12T12:30:00.000Z');

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

function customStore(heartbeat: unknown): OperatorStore {
  return {
    rpc: vi.fn(),
    recordHeartbeat: vi.fn(),
    heartbeat: vi.fn().mockResolvedValue(heartbeat),
    history: vi.fn(),
    runtime: vi.fn(),
    renderTargets: vi.fn(),
  } as unknown as OperatorStore;
}

function freshHeartbeat(overrides: Record<string, unknown> = {}) {
  return {
    observedAt: minutesAgo(1),
    actor: 'github-actions',
    state: 'succeeded',
    failureStreak: 0,
    cadenceMinutes: 240,
    sourceSha: 'current-sha',
    runId: '12345',
    ...overrides,
  };
}

describe('heartbeat missing branches', () => {
  it('reports an invalid timestamp with null optionals as null', async () => {
    const signal = await collectOperatorHeartbeatSignal(
      customStore({
        observedAt: 'not-a-timestamp',
        actor: 'github-actions',
        state: 'succeeded',
        failureStreak: 0,
      }),
      NOW,
    );

    expect(signal).toMatchObject({
      status: 'unknown',
      title: 'ops-operator heartbeat is invalid',
      evidence: {
        cadenceMinutes: null,
        sourceSha: null,
        runId: null,
      },
    });
  });

  it('carries null optionals through a fresh heartbeat', async () => {
    const signal = await collectOperatorHeartbeatSignal(
      customStore(
        freshHeartbeat({
          state: 'running',
          cadenceMinutes: undefined,
          sourceSha: undefined,
          runId: undefined,
        }),
      ),
      NOW,
    );

    // Missing cadence degrades before freshness is evaluated.
    expect(signal).toMatchObject({
      status: 'degraded',
      title: 'ops-operator heartbeat cadence provenance is missing',
      evidence: {
        cadenceMinutes: null,
        sourceSha: null,
        runId: null,
      },
    });
  });

  it('degrades a single failed cycle without a streak', async () => {
    const signal = await collectOperatorHeartbeatSignal(
      customStore(freshHeartbeat({ state: 'failed', failureStreak: 1 })),
      NOW,
    );

    expect(signal).toMatchObject({
      status: 'degraded',
      title: 'ops-operator last cycle failed',
    });
  });

  it('reports a fresh running cycle as healthy', async () => {
    const signal = await collectOperatorHeartbeatSignal(
      customStore(freshHeartbeat({ state: 'running', failureStreak: 0 })),
      NOW,
    );

    expect(signal).toMatchObject({
      status: 'healthy',
      title: 'ops-operator cycle is running',
    });
    expect(signal.detail).toContain('Current operator cycle started');
  });

  it('reports a fresh succeeded cycle as healthy', async () => {
    const signal = await collectOperatorHeartbeatSignal(
      customStore(freshHeartbeat({ state: 'succeeded', failureStreak: 0 })),
      NOW,
    );

    expect(signal).toMatchObject({
      status: 'healthy',
      title: 'ops-operator heartbeat is fresh',
    });
    expect(signal.detail).toContain('Latest operator cycle succeeded');
  });
});
