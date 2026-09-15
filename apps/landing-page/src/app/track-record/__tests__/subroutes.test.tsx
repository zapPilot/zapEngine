import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackRecordHookState } from '@/hooks/useTrackRecord';
import { mockSnapshotEntries } from '@/data/mock-track-record';
import { computePerformanceSummary } from '@/data/track-record-accessor';
import TrackRecordLayout from '../layout';
import PerformancePage from '../performance/page';
import PositionsPage from '../positions/page';
import RebalancesPage from '../rebalances/page';
import VerificationPage from '../verification/page';

const useTrackRecord = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useTrackRecord', () => ({ useTrackRecord }));
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function state(
  overrides: Partial<TrackRecordHookState> = {},
): TrackRecordHookState {
  const snapshots = mockSnapshotEntries
    .slice(-3)
    .map(({ snapshot }) => snapshot);
  return {
    meta: {
      schemaVersion: '1',
      strategyId: 'strategy',
      strategyVersion: 'v1',
      latestSnapshotCid: 'bafy-live',
      updatedAt: '2026-08-19T00:00:00.000Z',
    },
    snapshotEntries: [],
    snapshots,
    latestSnapshot: snapshots.at(-1) ?? null,
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
    source: 'live',
    setSource: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useTrackRecord.mockReturnValue(state());
});

describe('track-record layout', () => {
  it.each([
    ['backtest', 'Backtest'],
    ['live', 'Live'],
  ] as const)('renders the %s source state', (source, label) => {
    useTrackRecord.mockReturnValue(state({ source }));
    render(
      <TrackRecordLayout>
        <p>child route</p>
      </TrackRecordLayout>,
    );
    // The toggle button and the source badge render the same label, so the
    // page intentionally contains duplicates.
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getByText('child route')).toBeInTheDocument();
  });

  it('reports unavailable live data', () => {
    const base = state();
    useTrackRecord.mockReturnValue(
      state({
        source: 'live',
        meta: { ...base.meta!, latestSnapshotCid: '' },
      }),
    );
    render(
      <TrackRecordLayout>
        <p>child</p>
      </TrackRecordLayout>,
    );
    expect(screen.getByText('Live unavailable')).toBeInTheDocument();
  });
});

describe('track-record subroutes', () => {
  it.each([
    [PerformancePage, 'Loading performance data…'],
    [PositionsPage, 'Loading positions…'],
    [RebalancesPage, 'Loading rebalance data…'],
  ])('renders loading state', (Component, label) => {
    useTrackRecord.mockReturnValue(state({ isLoading: true }));
    render(<Component />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders performance statistics', () => {
    render(<PerformancePage />);
    expect(screen.getByText('Key Statistics')).toBeInTheDocument();
    // MetricsRow and the stat cards render the same labels by design.
    expect(screen.getAllByText('Worst Day').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Time Underwater').length).toBeGreaterThan(0);
  });

  it('renders empty and populated position states', () => {
    useTrackRecord.mockReturnValue(
      state({ latestSnapshot: null, positions: [] }),
    );
    const empty = render(<PositionsPage />);
    expect(screen.queryByText('Position Details')).toBeNull();
    empty.unmount();

    // The first mock set latestSnapshot to null and persists until replaced;
    // restore the default populated snapshot for the non-empty assertion.
    useTrackRecord.mockReturnValue(state());
    render(<PositionsPage />);
    expect(screen.getByText('Position Details')).toBeInTheDocument();
    expect(screen.getAllByText('Pricing Source').length).toBeGreaterThan(0);
  });

  it('renders zero, one, and multiple rebalance labels plus CID links', () => {
    const base = state();
    const without = base.snapshots.map((snapshot) => ({
      ...snapshot,
      transactions: [],
      rebalanceLogCids: undefined,
    }));
    useTrackRecord.mockReturnValue(state({ snapshots: without }));
    const empty = render(<RebalancesPage />);
    // The meta paragraph and RebalanceTable empty state render the same copy.
    expect(
      screen.getAllByText('No rebalances recorded yet.').length,
    ).toBeGreaterThanOrEqual(2);
    empty.unmount();

    const one = [
      {
        ...base.snapshots[0]!,
        transactions: [
          { chainId: 1, hash: '0xabc', type: 'rebalance' as const },
        ],
        rebalanceLogCids: ['bafy-log'],
      },
    ];
    useTrackRecord.mockReturnValue(state({ snapshots: one }));
    const single = render(<RebalancesPage />);
    expect(screen.getByText('1 rebalance found.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'bafy-log' })).toBeInTheDocument();
    single.unmount();

    useTrackRecord.mockReturnValue(
      state({
        snapshots: [
          ...one,
          { ...one[0]!, date: '2026-09-02', rebalanceLogCids: undefined },
        ],
      }),
    );
    render(<RebalancesPage />);
    expect(screen.getByText('2 rebalances found.')).toBeInTheDocument();
  });

  it('renders verification for live and backtest sources', () => {
    const live = render(<VerificationPage />);
    expect(screen.queryByText(/committed backtest dataset/)).toBeNull();
    live.unmount();
    useTrackRecord.mockReturnValue(state({ source: 'backtest' }));
    render(<VerificationPage />);
    expect(screen.getByText(/committed backtest dataset/)).toBeInTheDocument();
  });
});
