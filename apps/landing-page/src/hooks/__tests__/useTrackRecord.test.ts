import { renderHook, waitFor } from '@testing-library/react';
import type { DailySnapshot, TrackRecordMeta } from '@zapengine/types/strategy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchMeta: vi.fn(),
  fetchLatestSnapshot: vi.fn(),
  fetchSnapshotHistoryEntries: vi.fn(),
  computePerformanceSummary: vi.fn(),
  verifyCidChain: vi.fn(),
  verifyPerformanceMetrics: vi.fn(),
  verifySignature: vi.fn(),
  captureException: vi.fn(),
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

vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.captureException,
}));

vi.mock('@/data/mock-track-record', () => ({
  mockMeta: {},
  mockSnapshotEntries: [],
}));

const emptySummary = {
  totalDays: 0,
  startDate: '',
  endDate: '',
  startNav: '0',
  endNav: '0',
  cumulativeReturn: '0.00%',
  annualizedReturn: '0.00%',
  maxDrawdown: '0.00%',
  maxDrawdownDate: '',
  volatility30d: '0.00%',
  bestDay: '0.00%',
  bestDayDate: '',
  worstDay: '0.00%',
  worstDayDate: '',
  timeUnderwater: '0 days',
  sharpe: '—',
  sortino: '—',
};

const metaWithoutSnapshot = {
  schemaVersion: '1.0.0',
  strategyId: 'parking-strategy',
  strategyVersion: '2026-06-poc',
  latestSnapshotCid: null,
  updatedAt: '2026-07-30T00:00:00.000Z',
};

const liveMeta: TrackRecordMeta = {
  schemaVersion: '1.0.0',
  strategyId: 'parking-strategy',
  strategyVersion: '2026-06-poc',
  latestSnapshotCid: 'cid-latest',
  updatedAt: '2026-07-30T00:00:00.000Z',
  officialSigner: '0x0000000000000000000000000000000000000001',
};

const liveSnapshot: DailySnapshot = {
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

async function importLiveHook() {
  const [{ useTrackRecord }, { setTrackRecordSource }] = await Promise.all([
    import('../useTrackRecord'),
    import('@/data/track-record-source'),
  ]);
  setTrackRecordSource('live');
  return useTrackRecord;
}

describe('useTrackRecord live source', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.computePerformanceSummary.mockReturnValue(emptySummary);
    mocks.verifyCidChain.mockReturnValue({
      valid: true,
      brokenAt: undefined,
      totalSnapshots: 1,
    });
    mocks.verifyPerformanceMetrics.mockReturnValue({
      valid: true,
      errors: [],
    });
    mocks.verifySignature.mockResolvedValue({
      valid: true,
      signaturePresent: true,
      reason: 'verified',
    });
  });

  it('finishes cleanly when metadata has no published snapshot', async () => {
    mocks.fetchMeta.mockResolvedValue(metaWithoutSnapshot);
    const useTrackRecord = await importLiveHook();

    const { result } = renderHook(() => useTrackRecord());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({
      source: 'live',
      meta: metaWithoutSnapshot,
      latestSnapshot: null,
      snapshots: [],
      positions: [],
      error: null,
    });
    expect(mocks.fetchLatestSnapshot).not.toHaveBeenCalled();
    expect(mocks.fetchSnapshotHistoryEntries).not.toHaveBeenCalled();
  });

  it('loads and verifies a published snapshot history', async () => {
    const entries = [{ cid: 'cid-latest', snapshot: liveSnapshot }];
    const summary = { ...emptySummary, totalDays: 1, endNav: '100.00' };
    mocks.fetchMeta.mockResolvedValue(liveMeta);
    mocks.fetchLatestSnapshot.mockResolvedValue(liveSnapshot);
    mocks.fetchSnapshotHistoryEntries.mockResolvedValue(entries);
    mocks.computePerformanceSummary.mockReturnValue(summary);
    const useTrackRecord = await importLiveHook();

    const { result, unmount } = renderHook(() => useTrackRecord());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({
      source: 'live',
      meta: liveMeta,
      snapshotEntries: entries,
      snapshots: [liveSnapshot],
      latestSnapshot: liveSnapshot,
      positions: liveSnapshot.positions,
      summary,
      error: null,
      verification: {
        chainValid: true,
        totalSnapshots: 1,
        signatureValid: true,
        performanceValid: true,
        performanceErrors: [],
      },
    });
    expect(mocks.fetchSnapshotHistoryEntries).toHaveBeenCalledWith(
      'cid-latest',
      90,
    );
    expect(mocks.verifySignature).toHaveBeenCalledWith(
      liveSnapshot,
      liveMeta.officialSigner,
    );

    unmount();
    const cached = renderHook(() => useTrackRecord());
    await waitFor(() => expect(cached.result.current.isLoading).toBe(false));
    expect(cached.result.current.latestSnapshot).toBe(liveSnapshot);
    expect(mocks.fetchMeta).toHaveBeenCalledTimes(1);
  });

  it.each([
    [new Error('metadata unavailable'), 'metadata unavailable'],
    ['bad response', 'Unknown error'],
  ])(
    'exposes metadata load failures without stale data',
    async (failure, message) => {
      mocks.fetchMeta.mockRejectedValue(failure);
      const useTrackRecord = await importLiveHook();

      const { result } = renderHook(() => useTrackRecord());

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current).toMatchObject({
        source: 'live',
        meta: null,
        snapshots: [],
        latestSnapshot: null,
        error: message,
      });
      expect(mocks.captureException).toHaveBeenCalledExactlyOnceWith(failure, {
        tags: { component: 'track-record' },
      });
    },
  );

  it('reports the load failure once even when several consumers mount together', async () => {
    mocks.fetchMeta.mockRejectedValue(new Error('metadata unavailable'));
    const useTrackRecord = await importLiveHook();

    const first = renderHook(() => useTrackRecord());
    const second = renderHook(() => useTrackRecord());

    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));

    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  describe('load sharing', () => {
    beforeEach(() => {
      mocks.fetchMeta.mockResolvedValue(liveMeta);
      mocks.fetchLatestSnapshot.mockResolvedValue(liveSnapshot);
      mocks.fetchSnapshotHistoryEntries.mockResolvedValue([
        { cid: 'cid-latest', snapshot: liveSnapshot },
      ]);
    });

    it('shares one cold load across consumers mounted together', async () => {
      const useTrackRecord = await importLiveHook();

      const first = renderHook(() => useTrackRecord());
      const second = renderHook(() => useTrackRecord());

      await waitFor(() => expect(first.result.current.isLoading).toBe(false));
      await waitFor(() => expect(second.result.current.isLoading).toBe(false));

      expect(mocks.fetchMeta).toHaveBeenCalledTimes(1);
      expect(mocks.fetchSnapshotHistoryEntries).toHaveBeenCalledTimes(1);
      expect(mocks.verifySignature).toHaveBeenCalledTimes(1);
    });

    it('reuses the cached verification instead of re-verifying', async () => {
      const useTrackRecord = await importLiveHook();

      const first = renderHook(() => useTrackRecord());
      await waitFor(() => expect(first.result.current.isLoading).toBe(false));
      const verification = first.result.current.verification;
      first.unmount();

      const second = renderHook(() => useTrackRecord());
      await waitFor(() => expect(second.result.current.isLoading).toBe(false));

      expect(mocks.verifySignature).toHaveBeenCalledTimes(1);
      expect(mocks.verifyCidChain).toHaveBeenCalledTimes(1);
      expect(mocks.verifyPerformanceMetrics).toHaveBeenCalledTimes(1);
      expect(second.result.current.verification).toBe(verification);
    });
  });
});
