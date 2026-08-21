import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TrackRecordState } from '@/hooks/useTrackRecord';
import { MOCK_LATEST_CID, mockSnapshotEntries } from '@/data/mock-track-record';
import { computePerformanceSummary } from '@/data/track-record-accessor';
import TrackRecordPage from '../page';

const useTrackRecord = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useTrackRecord', () => ({ useTrackRecord }));

const DEMO_WALLET = '0x1111111111111111111111111111111111111111';
const LIVE_WALLET = '0x2222222222222222222222222222222222222222';

function state(overrides: Partial<TrackRecordState> = {}): TrackRecordState {
  const snapshots = mockSnapshotEntries
    .slice(-3)
    .map((entry) => entry.snapshot);

  return {
    meta: {
      schemaVersion: '1',
      strategyId: 'dma_fgi_portfolio_rules',
      strategyVersion: 'v1',
      latestSnapshotCid: MOCK_LATEST_CID,
      updatedAt: '2026-08-19T00:00:00.000Z',
    },
    snapshotEntries: [],
    snapshots,
    latestSnapshot: snapshots[snapshots.length - 1] ?? null,
    summary: computePerformanceSummary(snapshots),
    events: [],
    positions: [],
    verification: {
      chainValid: true,
      chainBrokenAt: undefined,
      totalSnapshots: snapshots.length,
      signatureValid: true,
      signature: null,
      performanceValid: true,
      performanceErrors: [],
    },
    isLoading: false,
    error: null,
    ...overrides,
  };
}

function pendingBanner() {
  return screen.queryByText(/Live tracking pending/);
}

describe('TrackRecordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('presents the demo dataset as pending, not as live', () => {
    useTrackRecord.mockReturnValue(state());

    render(<TrackRecordPage />);

    expect(pendingBanner()).toBeInTheDocument();
    // The chart belongs to the backtest section, not the live slot.
    expect(screen.getByText('Historical performance')).toBeInTheDocument();
    // A fabricated wallet address must not be offered as an on-chain link.
    expect(screen.queryByText(DEMO_WALLET)).toBeNull();
    expect(
      screen.getByText(/Live wallet addresses will appear here/),
    ).toBeInTheDocument();
  });

  it('shows live results and on-chain wallets once a real snapshot is published', () => {
    const base = state();
    useTrackRecord.mockReturnValue(
      state({
        meta: { ...base.meta!, latestSnapshotCid: 'bafyrealsnapshot' },
        latestSnapshot: {
          ...base.latestSnapshot!,
          walletAddresses: [LIVE_WALLET],
          chainIds: [1],
        },
      }),
    );

    render(<TrackRecordPage />);

    expect(pendingBanner()).toBeNull();
    expect(screen.queryByText('Historical performance')).toBeNull();
    expect(screen.getByRole('link', { name: LIVE_WALLET })).toHaveAttribute(
      'href',
      `https://etherscan.io/address/${LIVE_WALLET}`,
    );
  });

  it('shows the pending banner when no snapshot has been published at all', () => {
    const base = state();
    useTrackRecord.mockReturnValue(
      state({ meta: { ...base.meta!, latestSnapshotCid: '' } }),
    );

    render(<TrackRecordPage />);

    expect(pendingBanner()).toBeInTheDocument();
  });

  it('holds the pending banner back while the first load is still running', () => {
    const base = state();
    useTrackRecord.mockReturnValue(
      state({
        meta: null,
        latestSnapshot: null,
        snapshots: [],
        summary: base.summary,
        isLoading: true,
      }),
    );

    render(<TrackRecordPage />);

    expect(pendingBanner()).toBeNull();
  });
});
