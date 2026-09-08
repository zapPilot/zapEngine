import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TrackRecordHookState } from '@/hooks/useTrackRecord';
import { MOCK_LATEST_CID, mockSnapshotEntries } from '@/data/mock-track-record';
import { computePerformanceSummary } from '@/data/track-record-accessor';
import TrackRecordPage from '../page';

const useTrackRecord = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useTrackRecord', () => ({ useTrackRecord }));

const DEMO_WALLET = '0x1111111111111111111111111111111111111111';
const LIVE_WALLET = '0x2222222222222222222222222222222222222222';

function state(
  overrides: Partial<TrackRecordHookState> = {},
): TrackRecordHookState {
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
    source: 'backtest',
    setSource: vi.fn(),
    ...overrides,
  };
}

describe('TrackRecordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('presents backtest results by default without live wallet links', () => {
    useTrackRecord.mockReturnValue(state());

    render(<TrackRecordPage />);

    expect(screen.getByText(/Backtest mode/)).toBeInTheDocument();
    expect(screen.getByText('Historical performance')).toBeInTheDocument();
    expect(screen.queryByText(DEMO_WALLET)).toBeNull();
    expect(
      screen.getByText(/Wallet addresses are only shown in Live mode/),
    ).toBeInTheDocument();
  });

  it('shows live results and on-chain wallets after switching to Live', () => {
    const base = state();
    useTrackRecord.mockReturnValue(
      state({
        source: 'live',
        meta: { ...base.meta!, latestSnapshotCid: 'bafyrealsnapshot' },
        latestSnapshot: {
          ...base.latestSnapshot!,
          walletAddresses: [LIVE_WALLET],
          chainIds: [1],
        },
      }),
    );

    render(<TrackRecordPage />);

    expect(screen.queryByText(/Backtest mode/)).toBeNull();
    expect(screen.queryByText('Historical performance')).toBeNull();
    expect(screen.getByRole('link', { name: LIVE_WALLET })).toHaveAttribute(
      'href',
      `https://etherscan.io/address/${LIVE_WALLET}`,
    );
  });

  it('shows live unavailable when Live has no published snapshot', () => {
    const base = state();
    useTrackRecord.mockReturnValue(
      state({
        source: 'live',
        meta: { ...base.meta!, latestSnapshotCid: '' },
        latestSnapshot: null,
        snapshots: [],
      }),
    );

    render(<TrackRecordPage />);

    expect(screen.getByText(/Live tracking unavailable/)).toBeInTheDocument();
  });

  it('holds source status banners back while the first load is still running', () => {
    const base = state();
    useTrackRecord.mockReturnValue(
      state({
        source: 'live',
        meta: null,
        latestSnapshot: null,
        snapshots: [],
        summary: base.summary,
        isLoading: true,
      }),
    );

    render(<TrackRecordPage />);

    expect(screen.queryByText(/Live tracking unavailable/)).toBeNull();
    expect(screen.queryByText(/Backtest mode/)).toBeNull();
  });
});
