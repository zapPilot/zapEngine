import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => {
  const snapshot = {
    schemaVersion: '1.0.0',
    strategyId: 'parking-strategy',
    strategyVersion: '2026-06-poc',
    date: '2026-07-30',
    timestamp: '2026-07-30T00:00:00.000Z',
    chainIds: [1],
    walletAddresses: ['0x0000000000000000000000000000000000000001'],
    previousCid: null,
    nav: { usd: '100', eth: '0', btc: '0' },
    performance: {
      dailyReturn: '0.00%',
      cumulativeReturn: '0.00%',
      maxDrawdown: '0.00%',
    },
    positions: [
      {
        chainId: 1,
        protocol: 'aave',
        asset: 'USDC',
        amount: '100',
        valueUsd: '100',
        weight: '100.00%',
        pricingSource: 'fixture',
      },
    ],
    costs: {
      gasUsd: '0',
      slippageUsd: '0',
      protocolFeesUsd: '0',
      totalUsd: '0',
    },
    transactions: [],
    benchmarks: [],
  };

  return {
    meta: {
      schemaVersion: '1.0.0',
      strategyId: 'parking-strategy',
      strategyVersion: '2026-06-poc',
      latestSnapshotCid: 'mock-cid',
      updatedAt: '2026-07-30T00:00:00.000Z',
    },
    snapshot,
    entries: [{ cid: 'mock-cid', snapshot }],
  };
});

const mocks = vi.hoisted(() => ({
  fetchMeta: vi.fn(),
  fetchLatestSnapshot: vi.fn(),
  fetchSnapshotHistoryEntries: vi.fn(),
  computePerformanceSummary: vi.fn(),
  verifyCidChain: vi.fn(),
  verifyPerformanceMetrics: vi.fn(),
  verifySignature: vi.fn(),
  isTrackRecordMockEnabled: vi.fn(),
}));

vi.mock('@/data/track-record-accessor', () => ({
  fetchMeta: mocks.fetchMeta,
  fetchLatestSnapshot: mocks.fetchLatestSnapshot,
  fetchSnapshotHistoryEntries: mocks.fetchSnapshotHistoryEntries,
  computePerformanceSummary: mocks.computePerformanceSummary,
  verifyCidChain: mocks.verifyCidChain,
  verifyPerformanceMetrics: mocks.verifyPerformanceMetrics,
  verifySignature: mocks.verifySignature,
}));

vi.mock('@/data/mock-track-record', () => ({
  isTrackRecordMockEnabled: mocks.isTrackRecordMockEnabled,
  mockMeta: fixtures.meta,
  mockSnapshotEntries: fixtures.entries,
}));

const summary = {
  totalDays: 1,
  startDate: '2026-07-30',
  endDate: '2026-07-30',
  startNav: '100',
  endNav: '100',
  cumulativeReturn: '0.00%',
  maxDrawdown: '0.00%',
  maxDrawdownDate: '2026-07-30',
  bestDay: '0.00%',
  bestDayDate: '2026-07-30',
  worstDay: '0.00%',
  worstDayDate: '2026-07-30',
  timeUnderwater: '0 days',
  sharpe: '—',
  sortino: '—',
};

describe('useTrackRecord mock fallback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.fetchMeta.mockResolvedValue({
      ...fixtures.meta,
      latestSnapshotCid: null,
    });
    mocks.computePerformanceSummary.mockReturnValue(summary);
    mocks.verifyCidChain.mockReturnValue({
      valid: true,
      brokenAt: undefined,
      totalSnapshots: 1,
    });
    mocks.verifyPerformanceMetrics.mockReturnValue({ valid: true, errors: [] });
    mocks.verifySignature.mockResolvedValue({
      valid: true,
      signaturePresent: false,
      reason: 'not-required',
    });
    mocks.isTrackRecordMockEnabled.mockReturnValue(true);
  });

  it('serves reviewable mock data when no live snapshot is published', async () => {
    const { useTrackRecord } = await import('../useTrackRecord');

    const { result } = renderHook(() => useTrackRecord());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({
      meta: fixtures.meta,
      snapshotEntries: fixtures.entries,
      snapshots: [fixtures.snapshot],
      latestSnapshot: fixtures.snapshot,
      positions: fixtures.snapshot.positions,
      summary,
      error: null,
      verification: {
        chainValid: true,
        totalSnapshots: 1,
        signatureValid: true,
        performanceValid: true,
      },
    });
    expect(mocks.fetchLatestSnapshot).not.toHaveBeenCalled();
    expect(mocks.fetchSnapshotHistoryEntries).not.toHaveBeenCalled();
    expect(mocks.verifySignature).toHaveBeenCalledWith(fixtures.snapshot, '');
  });
});
