import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CostSyncSummary } from './services/cost-sync.js';
import type { MetricSnapshotSyncSummary } from './services/metric-snapshot-sync.js';

const state = vi.hoisted(() => ({
  credentials: [] as { name: string; present: boolean }[],
  costSummary: null as CostSyncSummary | null,
  metricSummary: null as MetricSnapshotSyncSummary | null,
  metricError: null as unknown,
}));

vi.mock('./config/env.js', () => ({
  readControlCenterConfig: () => ({ SERVICE: 'test' }),
  checkCostSyncCredentials: () => state.credentials,
}));
vi.mock('./services/cost-sync.js', () => ({
  syncCosts: async () => state.costSummary,
}));
vi.mock('./services/metric-snapshot-sync.js', () => ({
  syncMetricSnapshots: async () => {
    if (state.metricError) {
      throw state.metricError;
    }
    return state.metricSummary;
  },
}));

function costSummary(
  overrides: Partial<CostSyncSummary> = {},
): CostSyncSummary {
  return {
    syncedAt: '2026-09-17T07:42:00.000Z',
    persisted: 1,
    providers: [
      {
        provider: 'supabase',
        label: 'Supabase',
        status: 'persisted',
        accruedCostUsd: 25,
        message: null,
      },
    ],
    ...overrides,
  };
}

function metricSummary(
  overrides: Partial<MetricSnapshotSyncSummary> = {},
): MetricSnapshotSyncSummary {
  return {
    syncedAt: '2026-09-17T07:42:00.000Z',
    persisted: 15,
    skipped: [],
    ...overrides,
  };
}

let exit: ReturnType<typeof vi.spyOn>;
let log: ReturnType<typeof vi.spyOn>;
let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  state.credentials = [];
  state.costSummary = costSummary();
  state.metricSummary = metricSummary();
  state.metricError = null;
  exit = vi.spyOn(process, 'exit').mockImplementation(((code?: unknown) => {
    throw new Error(`process.exit(${String(code)})`);
  }) as never);
  log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ops:sync entrypoint', () => {
  it('refuses to sync when credentials are missing', async () => {
    state.credentials = [{ name: 'SUPABASE_URL', present: false }];

    await expect(import('./sync.js')).rejects.toThrow('process.exit(1)');
    expect(exit).toHaveBeenCalledWith(1);
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('SUPABASE_URL'),
    );
  });

  it('stays green when every provider and metric snapshot persists', async () => {
    await import('./sync.js');

    expect(exit).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('1 snapshots persisted'),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('15 metric snapshots persisted'),
    );
  });

  it('exits non-zero when a provider fails', async () => {
    state.costSummary = costSummary({
      persisted: 0,
      providers: [
        {
          provider: 'brave',
          label: 'Brave Search',
          status: 'error',
          accruedCostUsd: null,
          message: 'Provider request failed',
        },
      ],
    });

    await expect(import('./sync.js')).rejects.toThrow('process.exit(1)');
    expect(exit).toHaveBeenCalledWith(1);
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('1 provider(s) failed: brave'),
    );
  });

  it('exits non-zero when the metric snapshot sync fails', async () => {
    state.metricError = new Error('snapshot write down');

    await expect(import('./sync.js')).rejects.toThrow('process.exit(1)');
    expect(exit).toHaveBeenCalledWith(1);
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining(
        'metric snapshot sync failed: snapshot write down',
      ),
    );
  });

  it('keeps a skipped provider green', async () => {
    state.costSummary = costSummary({
      persisted: 0,
      providers: [
        {
          provider: 'brave',
          label: 'Brave Search',
          status: 'skipped',
          accruedCostUsd: null,
          message: 'Brave Search long-term quota window is not measurable',
        },
      ],
    });

    await import('./sync.js');

    expect(exit).not.toHaveBeenCalled();
  });
});
