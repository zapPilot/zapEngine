import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DailySnapshot } from '@zapengine/types/strategy';
import type { StrategyEvent } from '@/data/track-record-events';
import { NavCurveChart } from '../NavCurveChart';
import { pointPercent, xForPoint, yForValue } from '../chartGeometry';

const NAVS = ['10000', '11000', '12000', '13000', '14000'];

const SNAPSHOTS: DailySnapshot[] = NAVS.map((usd, index) => ({
  schemaVersion: '1',
  strategyId: 'dma_fgi_portfolio_rules',
  strategyVersion: 'v1',
  date: `2026-01-0${index + 1}`,
  timestamp: `2026-01-0${index + 1}T00:00:00.000Z`,
  chainIds: [1],
  walletAddresses: ['0x0000000000000000000000000000000000000001'],
  previousCid: null,
  nav: { usd },
  performance: {
    dailyReturn: '0.00%',
    cumulativeReturn: '0.00%',
    maxDrawdown: '0.00%',
  },
  positions: [],
  costs: {
    gasUsd: '0',
    slippageUsd: '0',
    protocolFeesUsd: '0',
    totalUsd: '0',
  },
  transactions: [],
  benchmarks: [],
}));

const EVENTS: StrategyEvent[] = [
  {
    date: '2026-01-02',
    type: 'rotate_to_eth',
    toAsset: 'ETH',
    fromAssets: ['BTC'],
    reason: 'test',
  },
  {
    date: '2026-01-04',
    type: 'sell',
    toAsset: null,
    fromAssets: ['SPY'],
    reason: 'test',
  },
];

describe('NavCurveChart', () => {
  beforeEach(() => {
    vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue(
      {
        left: 0,
        width: 500,
        top: 0,
        height: 200,
        right: 500,
        bottom: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      },
    );
  });

  it('falls back to the backtest notice with no snapshots', () => {
    render(<NavCurveChart snapshots={[]} />);

    expect(
      screen.getByText(/No live data yet — backtest performance below\./),
    ).toBeInTheDocument();
  });

  it('draws the series and labels the endpoint', () => {
    const { container } = render(<NavCurveChart snapshots={SNAPSHOTS} />);

    const series = container.querySelector('.chart-series.strategy');
    expect(series?.getAttribute('d')?.startsWith('M ')).toBe(true);
    expect(screen.getByText('140.00')).toBeInTheDocument();
  });

  it('exposes one scrubber position per snapshot', () => {
    render(<NavCurveChart snapshots={SNAPSHOTS} />);

    expect(screen.getByRole('slider')).toHaveAttribute(
      'aria-valuemax',
      String(SNAPSHOTS.length - 1),
    );
  });

  it('places each marker on the curve, joined by date', () => {
    const { container } = render(
      <NavCurveChart snapshots={SNAPSHOTS} events={EVENTS} />,
    );

    const markers = container.querySelectorAll<HTMLElement>(
      '.chart-event-marker',
    );
    expect(markers).toHaveLength(2);

    // The rotation lands on 2026-01-02, whose indexed value is 110.
    const values = NAVS.map((usd) => (Number(usd) / Number(NAVS[0])) * 100);
    const domainMin = Math.floor(Math.min(...values, 100) / 10) * 10;
    const domainMax = Math.ceil(Math.max(...values) / 10) * 10 + 10;
    const expected = pointPercent(
      xForPoint(1, values.length),
      yForValue(values[1]!, domainMin, domainMax),
    );

    // Compared numerically: CSSOM drops the trailing zero on read-back.
    expect(parseFloat(markers[0]!.style.left)).toBeCloseTo(
      parseFloat(expected.left),
      4,
    );
    expect(parseFloat(markers[0]!.style.top)).toBeCloseTo(
      parseFloat(expected.top),
      4,
    );
  });

  it('colours by asset and shapes by action', () => {
    const { container } = render(
      <NavCurveChart snapshots={SNAPSHOTS} events={EVENTS} />,
    );

    const markers = container.querySelectorAll('.chart-event-marker');
    expect(markers[0]).toHaveAttribute('data-asset', 'ETH');
    expect(markers[0]).toHaveAttribute('data-action', 'rotate');
    // A sell has no destination, so it is coloured by what was sold.
    expect(markers[1]).toHaveAttribute('data-asset', 'SPY');
    expect(markers[1]).toHaveAttribute('data-action', 'sell');
  });

  it('drops events whose date the series does not contain', () => {
    const { container } = render(
      <NavCurveChart
        snapshots={SNAPSHOTS}
        events={[{ ...EVENTS[0]!, date: '2019-01-01' }, ...EVENTS.slice(1)]}
      />,
    );

    expect(container.querySelectorAll('.chart-event-marker')).toHaveLength(1);
  });

  it('lists only the categories present, and keeps the legend readable', () => {
    const { container } = render(
      <NavCurveChart snapshots={SNAPSHOTS} events={EVENTS} />,
    );

    expect(screen.getByText('Strategy')).toBeInTheDocument();
    expect(screen.getByText('ETH')).toBeInTheDocument();
    expect(screen.getByText('SPY')).toBeInTheDocument();
    expect(screen.queryByText('BTC')).toBeNull();
    expect(screen.getByText('Rotate')).toBeInTheDocument();
    expect(screen.getByText('Sell')).toBeInTheDocument();
    expect(screen.queryByText('Buy')).toBeNull();
    // With two encoding channels the legend is the identity channel, so it
    // must not be hidden the way a single-swatch legend could be.
    expect(container.querySelector('.chart-legend')).not.toHaveAttribute(
      'aria-hidden',
    );
  });

  it('shows no event legend groups when there is nothing to mark', () => {
    render(<NavCurveChart snapshots={SNAPSHOTS} />);

    expect(screen.getByText('Strategy')).toBeInTheDocument();
    expect(screen.queryByText('Rotate')).toBeNull();
  });
});
