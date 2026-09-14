import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DailySnapshot, Position } from '@zapengine/types/strategy';

import type { TrackRecordHookState } from '@/hooks/useTrackRecord';
import { mockMeta, mockSnapshotEntries } from '@/data/mock-track-record';
import { computePerformanceSummary } from '@/data/track-record-accessor';
import { TABS } from '@/config/track-record';
import { BenchmarkChart } from '../BenchmarkChart';
import { DrawdownChart } from '../DrawdownChart';
import { PositionsTable } from '../PositionsTable';
import { RebalanceTable } from '../RebalanceTable';
import { TrackRecordLoading } from '../TrackRecordLoading';
import { TrackRecordNav } from '../TrackRecordNav';
import {
  TrackRecordSourceControls,
  TrackRecordSourceToggle,
} from '../TrackRecordSourceToggle';
import { VerificationPanel } from '../VerificationPanel';

const TEMPLATE = mockSnapshotEntries[mockSnapshotEntries.length - 1]!.snapshot;

function snapshot(
  date: string,
  navUsd: number,
  cumulativeReturn: number,
  overrides: Partial<DailySnapshot> = {},
): DailySnapshot {
  return {
    ...TEMPLATE,
    date,
    timestamp: `${date}T00:00:00.000Z`,
    nav: { ...TEMPLATE.nav, usd: String(navUsd) },
    performance: {
      ...TEMPLATE.performance,
      cumulativeReturn: `${cumulativeReturn}%`,
    },
    positions: [],
    transactions: [],
    benchmarks: [],
    ...overrides,
  };
}

describe('BenchmarkChart', () => {
  it('renders the empty state when there are no snapshots', () => {
    render(<BenchmarkChart snapshots={[]} className="compact" />);
    expect(screen.getByText('No live data yet.').parentElement).toHaveClass(
      'compact',
    );
  });

  it('draws only the strategy when no DCA benchmark exists', () => {
    const { container } = render(
      <BenchmarkChart snapshots={[snapshot('2026-01-01', 100, 4)]} />,
    );
    expect(container.querySelector('.chart-series.strategy')).not.toBeNull();
    expect(container.querySelector('.chart-series.dca')).toBeNull();
    expect(container.querySelector('.legend-item.dca')).toBeNull();
  });

  it('omits the DCA series when the opening NAV is zero', () => {
    const zeroNav = snapshot('2026-01-01', 0, 0, {
      benchmarks: [{ name: 'DCA Classic', cumulativeReturn: '1%' }],
    });
    const { container } = render(<BenchmarkChart snapshots={[zeroNav]} />);
    expect(container.querySelector('.chart-series.strategy')).not.toBeNull();
    expect(container.querySelector('.chart-series.dca')).toBeNull();
  });

  it('uses the opening baseline until the named benchmark appears', () => {
    const snapshots = [
      snapshot('2026-01-01', 100, -2, {
        benchmarks: [{ name: 'Other', cumulativeReturn: '3%' }],
      }),
      snapshot('2026-01-02', 110, 12, {
        benchmarks: [{ name: 'DCA Classic', cumulativeReturn: '8%' }],
      }),
    ];
    const { container } = render(
      <BenchmarkChart snapshots={snapshots} className="wide" />,
    );
    expect(screen.getByText('DCA Classic')).toBeInTheDocument();
    expect(container.querySelector('.chart-series.dca')).not.toBeNull();
    expect(container.querySelector('figure')).toHaveClass('wide');
  });
});

describe('DrawdownChart', () => {
  it('renders the empty state with the requested class', () => {
    render(<DrawdownChart snapshots={[]} className="compact" />);
    expect(screen.getByText('No live data yet.').parentElement).toHaveClass(
      'compact',
    );
  });

  it('handles a zero opening NAV without dividing by zero', () => {
    const { container } = render(
      <DrawdownChart snapshots={[snapshot('2026-01-01', 0, 0)]} />,
    );
    expect(screen.getByText('Max Drawdown: 0.00%')).toBeInTheDocument();
    expect(container.querySelector('.drawdown-area')).not.toBeNull();
  });

  it('tracks new peaks and subsequent drawdown points', () => {
    const snapshots = [
      snapshot('2026-01-01', 100, 0),
      snapshot('2026-01-02', 120, 20),
      snapshot('2026-01-03', 90, -10),
    ];
    const { container } = render(
      <DrawdownChart snapshots={snapshots} className="wide" />,
    );
    expect(screen.getByText('Max Drawdown: 25.00%')).toBeInTheDocument();
    expect(
      container.querySelector('.drawdown-area')?.getAttribute('d'),
    ).toMatch(/^M .* L .* L .* Z$/);
    expect(container.querySelector('figure')).toHaveClass('wide');
  });
});

describe('track-record tables', () => {
  it('renders the positions empty state', () => {
    render(<PositionsTable positions={[]} />);
    expect(
      screen.getByText('No positions available.').parentElement,
    ).toHaveClass('positions-table-empty');
  });

  it('renders positions with and without token addresses', () => {
    const original = TEMPLATE.positions[0]!;
    const withoutAddress = { ...original };
    delete withoutAddress.tokenAddress;
    const positions: Position[] = [
      original,
      { ...withoutAddress, asset: 'ALT', protocol: 'Unknown' },
    ];
    const { container } = render(
      <PositionsTable positions={positions} className="dense" />,
    );
    expect(container.querySelector('.positions-table-wrap')).toHaveClass(
      'dense',
    );
    expect(
      screen.getByText(original.tokenAddress!.slice(0, 8) + '…'),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('renders the rebalances empty state', () => {
    render(<RebalanceTable snapshots={[snapshot('2026-01-01', 100, 0)]} />);
    expect(screen.getByText('No rebalances recorded yet.')).toBeInTheDocument();
  });

  it('filters non-rebalance snapshots and transactions', () => {
    const rebalanceHash = '0xrebalance123456789';
    const mixed = snapshot('2026-01-02', 101, 1, {
      transactions: [
        { chainId: 1, hash: '0xdeposit', type: 'deposit' },
        { chainId: 1, hash: rebalanceHash, type: 'rebalance' },
      ],
    });
    const { container } = render(
      <RebalanceTable
        snapshots={[snapshot('2026-01-01', 100, 0), mixed]}
        className="dense"
      />,
    );
    expect(container.querySelector('.rebalance-table-wrap')).toHaveClass(
      'dense',
    );
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(
      screen.getByText(rebalanceHash.slice(0, 10) + '…'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/0xdeposit/)).toBeNull();
  });
});

describe('track-record navigation and source controls', () => {
  it('renders the loading label and every track-record tab', () => {
    const { rerender } = render(
      <TrackRecordLoading label="Loading history…" />,
    );
    expect(screen.getByText('Loading history…')).toBeInTheDocument();

    rerender(<TrackRecordNav />);
    const navigation = screen.getByRole('navigation', {
      name: 'Track record sections',
    });
    expect(within(navigation).getAllByRole('link')).toHaveLength(TABS.length);
    for (const tab of TABS) {
      expect(
        within(navigation).getByRole('link', { name: tab.label }),
      ).toHaveAttribute('href', tab.href);
    }
  });

  it('marks the selected source and emits both source changes', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <TrackRecordSourceControls>
        <span>Dataset</span>
        <TrackRecordSourceToggle source="backtest" onChange={onChange} />
      </TrackRecordSourceControls>,
    );
    expect(screen.getByText('Dataset')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Backtest' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Live' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    expect(onChange).toHaveBeenLastCalledWith('live');

    rerender(
      <TrackRecordSourceControls>
        <span>Dataset</span>
        <TrackRecordSourceToggle source="live" onChange={onChange} />
      </TrackRecordSourceControls>,
    );
    expect(screen.getByRole('button', { name: 'Backtest' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Live' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Backtest' }));
    expect(onChange).toHaveBeenLastCalledWith('backtest');
  });
});

const LIVE_CID = 'bafybeigdyrzt4livecid000000000000000000000000000000000';
const SIGNER = '0x1111111111111111111111111111111111111111';
const RECOVERED = '0x2222222222222222222222222222222222222222';
const SIGNED_SNAPSHOT: DailySnapshot = {
  ...TEMPLATE,
  signature: {
    signer: SIGNER,
    signedAt: '2026-09-14T00:00:00.000Z',
    messageHash: '0xclaimed',
    signature: '0xsigned',
  },
};

function verificationState(
  overrides: Partial<TrackRecordHookState> = {},
): TrackRecordHookState {
  return {
    meta: { ...mockMeta, latestSnapshotCid: LIVE_CID },
    snapshotEntries: [{ cid: LIVE_CID, snapshot: SIGNED_SNAPSHOT }],
    snapshots: [SIGNED_SNAPSHOT],
    latestSnapshot: SIGNED_SNAPSHOT,
    summary: computePerformanceSummary([SIGNED_SNAPSHOT]),
    events: [],
    positions: SIGNED_SNAPSHOT.positions,
    verification: {
      chainValid: true,
      chainBrokenAt: undefined,
      totalSnapshots: 1,
      signatureValid: true,
      signature: {
        valid: true,
        signaturePresent: true,
        recoveredSigner: RECOVERED,
        computedMessageHash: '0xcomputed0123456789abcdef',
        messageHashValid: true,
      },
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

describe('VerificationPanel', () => {
  it('renders its loading state', () => {
    render(
      <VerificationPanel
        className="compact"
        state={verificationState({ isLoading: true })}
      />,
    );
    expect(
      screen.getByText('Loading verification data…').parentElement,
    ).toHaveClass('compact');
  });

  it('renders the unsigned backtest fallbacks', () => {
    render(
      <VerificationPanel
        state={verificationState({
          meta: null,
          snapshotEntries: [],
          snapshots: [],
          latestSnapshot: null,
          positions: [],
          source: 'backtest',
          verification: {
            chainValid: true,
            chainBrokenAt: undefined,
            totalSnapshots: 0,
            signatureValid: true,
            signature: null,
            performanceValid: true,
            performanceErrors: [],
          },
        })}
      />,
    );
    expect(screen.getByText('Valid')).toBeInTheDocument();
    expect(
      screen.getByText('No signature (v0 — optional)'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('DailySnapshotSchema vunknown'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Backtest mode — switch to Live/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Full Chain Snapshots')).toBeNull();
  });

  it('renders valid live signature, gateway and chain details', () => {
    const entries = Array.from({ length: 11 }, (_, index) => ({
      cid: `bafy-live-${index}`,
      snapshot: {
        ...SIGNED_SNAPSHOT,
        date: `2026-09-${String(index + 1).padStart(2, '0')}`,
      },
    }));
    const { container } = render(
      <VerificationPanel
        className="wide"
        state={verificationState({ snapshotEntries: entries })}
      />,
    );
    expect(container.querySelector('.verification-panel')).toHaveClass('wide');
    expect(
      screen.getByText(`Valid — recovered signer: ${RECOVERED}`),
    ).toBeInTheDocument();
    expect(screen.getByText('Message hash: verified')).toBeInTheDocument();
    expect(screen.getByText(/Computed hash: 0xcomputed/)).toBeInTheDocument();
    expect(screen.getByText(`CID: ${LIVE_CID}`)).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(container.querySelectorAll('.snapshot-cid-list li')).toHaveLength(
      10,
    );
  });

  it('falls back to the claimed signer when recovery supplied no signer', () => {
    render(
      <VerificationPanel
        state={verificationState({
          verification: {
            ...verificationState().verification,
            signature: {
              valid: true,
              signaturePresent: true,
              messageHashValid: false,
            },
          },
        })}
      />,
    );
    expect(
      screen.getByText(`Valid — recovered signer: ${SIGNER}`),
    ).toBeInTheDocument();
    expect(screen.getByText('Message hash: mismatch')).toBeInTheDocument();
    expect(screen.queryByText(/Computed hash:/)).toBeNull();
  });

  it('renders broken-chain and supplied failure reasons', () => {
    render(
      <VerificationPanel
        state={verificationState({
          verification: {
            chainValid: false,
            chainBrokenAt: 3,
            totalSnapshots: 4,
            signatureValid: false,
            signature: {
              valid: false,
              signaturePresent: true,
              reason: 'bad signature',
              messageHashValid: false,
            },
            performanceValid: false,
            performanceErrors: ['bad return'],
          },
        })}
      />,
    );
    expect(screen.getByText('Broken at snapshot 3')).toBeInTheDocument();
    expect(screen.getByText('Invalid — bad signature')).toBeInTheDocument();
    expect(screen.getByText('FAIL — bad return')).toBeInTheDocument();
  });

  it('uses generic failure messages and the live-empty notice', () => {
    render(
      <VerificationPanel
        state={verificationState({
          meta: { ...mockMeta, latestSnapshotCid: '' },
          snapshotEntries: [],
          snapshots: [],
          latestSnapshot: null,
          positions: [],
          verification: {
            chainValid: false,
            chainBrokenAt: undefined,
            totalSnapshots: 0,
            signatureValid: false,
            signature: null,
            performanceValid: false,
            performanceErrors: [],
          },
        })}
      />,
    );
    expect(screen.getByText('Broken at snapshot')).toBeInTheDocument();
    expect(
      screen.getByText('No signature (v0 — optional)'),
    ).toBeInTheDocument();
    expect(screen.getByText('FAIL — performance mismatch')).toBeInTheDocument();
    expect(screen.getByText('No live snapshot yet')).toBeInTheDocument();
  });

  it('uses the generic invalid-signature reason for a signed snapshot', () => {
    render(
      <VerificationPanel
        state={verificationState({
          verification: {
            ...verificationState().verification,
            signatureValid: false,
            signature: null,
          },
        })}
      />,
    );
    expect(
      screen.getByText('Invalid — signature check failed'),
    ).toBeInTheDocument();
  });
});
