import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { DailySnapshot, Position } from '@zapengine/types/strategy';
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

function positions(weights: Record<string, number>): Position[] {
  return Object.entries(weights).map(([asset, weight]) => ({
    chainId: 1,
    protocol: 'Test',
    asset,
    amount: '1',
    valueUsd: '1',
    weight: `${weight.toFixed(2)}%`,
    pricingSource: 'Test',
  }));
}

/** Same five days, holding a real position that rotates on the event dates. */
const HELD: Record<string, number>[] = [
  { BTC: 50, USDC: 50 },
  { ETH: 50, USDC: 50 },
  { ETH: 50, USDC: 50 },
  { USDC: 100 },
  { USDC: 100 },
];

const SNAPSHOTS_WITH_POSITIONS: DailySnapshot[] = SNAPSHOTS.map(
  (snapshot, index) => ({ ...snapshot, positions: positions(HELD[index]!) }),
);

/** clientX for an index, given the 500px box the suite stubs. */
function xForIndex(index: number): number {
  return (index / (SNAPSHOTS.length - 1)) * 500;
}

function tooltipText(container: HTMLElement): string {
  return container.querySelector('.chart-tooltip')?.textContent ?? '';
}

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

  it('shows the position as it stood on a day with no trade', () => {
    const { container } = render(
      <NavCurveChart snapshots={SNAPSHOTS_WITH_POSITIONS} events={EVENTS} />,
    );

    fireEvent.pointerMove(screen.getByRole('slider'), {
      clientX: xForIndex(2),
    });

    expect(container.querySelectorAll('.chart-tooltip-alloc')).toHaveLength(1);
    expect(tooltipText(container)).toContain('ETH 50%  Cash 50%');
  });

  it('puts a trading day between the position before it and after it', () => {
    const { container } = render(
      <NavCurveChart snapshots={SNAPSHOTS_WITH_POSITIONS} events={EVENTS} />,
    );

    fireEvent.pointerMove(screen.getByRole('slider'), {
      clientX: xForIndex(1),
    });

    const bars = container.querySelectorAll('.chart-tooltip-alloc');
    expect(bars).toHaveLength(2);
    // Before is the previous day's book — BTC, which the rotation left.
    const readout = screen
      .getByRole('slider')
      .getAttribute('aria-valuetext')
      ?.replace(/\s+/g, ' ');
    expect(readout).toContain('Before BTC 50%, Cash 50%');
    expect(readout).toContain('After ETH 50%, Cash 50%');
  });

  it('falls back to one bar when a trade lands on day zero', () => {
    const { container } = render(
      <NavCurveChart
        snapshots={SNAPSHOTS_WITH_POSITIONS}
        events={[{ ...EVENTS[0]!, date: '2026-01-01' }]}
      />,
    );

    fireEvent.pointerMove(screen.getByRole('slider'), {
      clientX: xForIndex(0),
    });

    expect(container.querySelectorAll('.chart-tooltip-alloc')).toHaveLength(1);
    expect(tooltipText(container)).toContain('BTC 50%  Cash 50%');
  });

  it('draws no bar for snapshots that carry no positions', () => {
    const { container } = render(
      <NavCurveChart snapshots={SNAPSHOTS} events={EVENTS} />,
    );

    fireEvent.pointerMove(screen.getByRole('slider'), {
      clientX: xForIndex(1),
    });

    expect(container.querySelector('.chart-tooltip')).not.toBeNull();
    expect(container.querySelector('.chart-tooltip-alloc-group')).toBeNull();
  });

  it('offers an expand button in the header, and nothing expanded until asked', () => {
    render(<NavCurveChart snapshots={SNAPSHOTS} events={EVENTS} />);

    expect(
      screen.getByRole('button', { name: 'Expand Strategy NAV chart' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers no expand button when there is no chart to expand', () => {
    render(<NavCurveChart snapshots={[]} />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders the same chart inside the overlay, once, without recursing', () => {
    render(<NavCurveChart snapshots={SNAPSHOTS} events={EVENTS} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Expand Strategy NAV chart' }),
    );

    // The overlay is portalled to <body>, so count from the document. Scoped to
    // the chart's own class: MarkerGlyph renders an <svg> per marker too.
    expect(document.querySelectorAll('svg.nav-curve-svg')).toHaveLength(2);
    // Two independent scrubbers, and only one expand button — the enlarged copy
    // carries none, which is what terminates the recursion.
    expect(screen.getAllByRole('slider')).toHaveLength(2);
    expect(
      screen.getAllByRole('button', { name: 'Expand Strategy NAV chart' }),
    ).toHaveLength(1);
  });

  it('scrubs the overlay chart independently of the inline one', () => {
    render(<NavCurveChart snapshots={SNAPSHOTS} events={EVENTS} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Expand Strategy NAV chart' }),
    );
    const [inline, expanded] = screen.getAllByRole('slider');

    fireEvent.focus(expanded!);
    fireEvent.keyDown(expanded!, { key: 'ArrowRight' });

    expect(expanded).toHaveAttribute('aria-valuenow', '1');
    expect(inline).toHaveAttribute('aria-valuenow', '0');
  });

  it('sizes the trade in the tooltip when the event carries the figures', () => {
    const { container } = render(
      <NavCurveChart
        snapshots={SNAPSHOTS_WITH_POSITIONS}
        events={[{ ...EVENTS[0]!, amountUsd: 10408.84, amountPercent: 19.4 }]}
      />,
    );

    fireEvent.pointerMove(screen.getByRole('slider'), {
      clientX: xForIndex(1),
    });

    expect(tooltipText(container)).toContain(
      'Rotated BTC into ETH · $10.4k · 19% of portfolio',
    );
  });
});
