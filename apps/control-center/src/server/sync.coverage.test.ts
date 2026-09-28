import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CostSyncSummary } from './services/cost-sync.js';
import type { MetricSnapshotSyncSummary } from './services/metric-snapshot-sync.js';

const state = vi.hoisted(() => ({
  credentials: [] as Array<{ name: string; present: boolean }>,
  costSummary: null as CostSyncSummary | null,
  metricSummary: null as MetricSnapshotSyncSummary | null,
}));

vi.mock('./config/env.js', () => ({
  readControlCenterConfig: () => ({ SERVICE: 'coverage' }),
  checkCostSyncCredentials: () => state.credentials,
}));

vi.mock('./services/cost-sync.js', () => ({
  syncCosts: async () => state.costSummary,
}));

vi.mock('./services/metric-snapshot-sync.js', () => ({
  syncMetricSnapshots: async () => state.metricSummary,
}));

function persistedCostSummary(): CostSyncSummary {
  return {
    syncedAt: '2026-09-28T00:00:00.000Z',
    persisted: 2,
    providers: [
      {
        provider: 'openrouter',
        label: 'OpenRouter',
        status: 'persisted',
        accruedCostUsd: 3.5,
        message: null,
      },
    ],
  };
}

function persistedMetricSummary(
  overrides: Partial<MetricSnapshotSyncSummary> = {},
): MetricSnapshotSyncSummary {
  return {
    syncedAt: '2026-09-28T00:00:00.000Z',
    persisted: 9,
    skipped: [],
    failed: [],
    versionContext: {
      observedAt: '2026-09-28T00:00:00.000Z',
      mainSha: null,
      deployments: [],
      gaps: [],
    },
    ...overrides,
  };
}

let exit: ReturnType<typeof vi.spyOn>;
let log: ReturnType<typeof vi.spyOn>;
let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  state.credentials = [];
  state.costSummary = persistedCostSummary();
  state.metricSummary = persistedMetricSummary();
  exit = vi.spyOn(process, 'exit').mockImplementation(((code?: unknown) => {
    throw new Error(`process.exit(${String(code)})`);
  }) as never);
  log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ops:sync coverage gaps', () => {
  it('logs set for every visible credential', async () => {
    state.credentials = [
      { name: 'SUPABASE_URL', present: true },
      { name: 'FLY_API_TOKEN', present: true },
    ];

    await import('./sync.js');

    expect(exit).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('SUPABASE_URL=set'),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('FLY_API_TOKEN=set'),
    );
  });

  it('names skipped metric snapshots while staying green', async () => {
    state.metricSummary = persistedMetricSummary({
      persisted: 8,
      skipped: ['avg_episode_cost_usd'],
    });

    await import('./sync.js');

    expect(exit).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('skipped: avg_episode_cost_usd'),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('8 metric snapshots persisted'),
    );
  });
});
