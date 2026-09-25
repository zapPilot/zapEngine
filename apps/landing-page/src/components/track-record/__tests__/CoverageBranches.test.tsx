import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DailySnapshot } from '@zapengine/types/strategy';
import type { TrackRecordHookState } from '@/hooks/useTrackRecord';
import { NavCurveChart } from '../NavCurveChart';
import { PositionsTable } from '../PositionsTable';
import { RebalanceTable } from '../RebalanceTable';
import { VerificationPanel } from '../VerificationPanel';

function snapshot(regime?: string): DailySnapshot {
  return {
    schemaVersion: '1',
    strategyId: 'strategy',
    strategyVersion: 'v1',
    date: '2026-01-01',
    timestamp: '2026-01-01T00:00:00.000Z',
    chainIds: [1],
    walletAddresses: [],
    previousCid: null,
    nav: { usd: '0' },
    performance: {
      dailyReturn: '0%',
      cumulativeReturn: '0%',
      maxDrawdown: '0%',
    },
    positions: [
      {
        chainId: 1,
        protocol: 'test',
        asset: 'ETH',
        amount: '1',
        valueUsd: '100',
        weight: '100%',
        pricingSource: 'test',
      },
    ],
    costs: {
      gasUsd: '0',
      slippageUsd: '0',
      protocolFeesUsd: '0',
      totalUsd: '0',
    },
    transactions: [{ chainId: 1, hash: '0x1', type: 'rebalance' }],
    benchmarks: [],
    ...(regime ? { regime } : {}),
  } as DailySnapshot;
}

describe('track-record presentation edge branches', () => {
  it('renders a NAV curve whose initial value is zero', () => {
    render(<NavCurveChart snapshots={[snapshot()]} />);
    expect(screen.getByText('100.00')).toBeInTheDocument();
  });

  it('renders populated tables without optional class names', () => {
    render(
      <>
        <PositionsTable positions={snapshot().positions} />
        <RebalanceTable snapshots={[snapshot()]} />
      </>,
    );
    expect(screen.getByText('ETH')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /0x1/ })).toBeInTheDocument();
  });

  it('renders verification loading without a class name', () => {
    render(
      <VerificationPanel
        state={
          {
            isLoading: true,
            meta: null,
            snapshotEntries: [],
            verification: undefined,
            latestSnapshot: null,
            source: 'backtest',
          } as unknown as TrackRecordHookState
        }
      />,
    );
    expect(screen.getByText(/loading verification data/i)).toBeInTheDocument();
  });
});
