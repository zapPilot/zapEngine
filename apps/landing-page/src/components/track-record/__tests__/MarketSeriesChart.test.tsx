import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MarketDmaPoint } from '@/data/market-signals';
import { MarketSeriesChart } from '../MarketSeriesChart';

const POINTS: MarketDmaPoint[] = [
  { date: '2026-08-19', value: 100, dma: 90 },
  { date: '2026-08-20', value: 95, dma: 96 },
];

function chart(points: MarketDmaPoint[] = POINTS) {
  return (
    <MarketSeriesChart
      color="var(--event-btc)"
      formatValue={(value) => `$${value.toFixed(0)}`}
      kicker="Trend"
      points={points}
      title="Bitcoin"
      tokenSymbol="BTC"
    />
  );
}

describe('MarketSeriesChart', () => {
  it('draws market and DMA paths with accessible chart text', () => {
    const { container } = render(chart());

    expect(container.querySelector('.chart-series.market')).toHaveAttribute(
      'd',
    );
    expect(container.querySelector('.chart-series.market-dma')).toHaveAttribute(
      'd',
    );
    expect(
      screen.getByRole('img', { name: /Bitcoin price and 200-DMA/ }),
    ).toBeInTheDocument();
  });

  it('reports the latest below-DMA state', () => {
    render(chart());
    expect(screen.getByText('▼ Below 200-DMA')).toBeInTheDocument();
  });

  it('reports the latest above-DMA state', () => {
    render(chart([{ date: '2026-08-20', value: 100, dma: 90 }]));
    expect(screen.getByText('▲ Above 200-DMA')).toBeInTheDocument();
  });

  it('renders an empty state without points', () => {
    render(chart([]));
    expect(
      screen.getByText('No Bitcoin signal data available.'),
    ).toBeInTheDocument();
  });

  it('renders without a DMA chip when the latest point has no DMA', () => {
    const { container } = render(
      chart([
        { date: '2026-08-19', value: 100, dma: 90 },
        { date: '2026-08-20', value: 95, dma: null },
      ]),
    );
    expect(container.querySelector('.signal-chip')).not.toBeInTheDocument();
    expect(container.querySelector('.chart-series.market')).toHaveAttribute(
      'd',
    );
  });

  it('renders a flat nonzero series with symmetric padding', () => {
    const { container } = render(
      chart([
        { date: '2026-08-19', value: 100, dma: 100 },
        { date: '2026-08-20', value: 100, dma: 100 },
      ]),
    );
    expect(container.querySelector('.chart-series.market')).toHaveAttribute(
      'd',
    );
  });

  it('renders an all-zero series without collapsing the domain', () => {
    const { container } = render(
      chart([
        { date: '2026-08-19', value: 0, dma: null },
        { date: '2026-08-20', value: 0, dma: null },
      ]),
    );
    expect(container.querySelector('.chart-series.market')).toHaveAttribute(
      'd',
    );
  });

  it('renders a bare title without token adornments', () => {
    const { container } = render(
      <MarketSeriesChart
        color="var(--event-btc)"
        formatValue={(value) => `$${value.toFixed(0)}`}
        kicker="Trend"
        points={POINTS}
        title="Bitcoin"
      />,
    );
    expect(container.querySelector('h3')).toHaveTextContent('Bitcoin');
    expect(
      container.querySelector('.signal-token-pair'),
    ).not.toBeInTheDocument();
  });

  it('renders a token pair when provided', () => {
    const { container } = render(
      <MarketSeriesChart
        color="var(--event-eth)"
        formatValue={(value) => value.toFixed(4)}
        kicker="Relative strength"
        points={POINTS}
        title="ETH/BTC Ratio"
        tokenPair={['ETH', 'BTC']}
      />,
    );
    expect(container.querySelector('.signal-token-pair')).toBeInTheDocument();
  });

  it('renders the caption when provided', () => {
    const { container } = render(
      <MarketSeriesChart
        caption="Forward-filled across non-trading days."
        color="var(--event-btc)"
        formatValue={(value) => `$${value.toFixed(0)}`}
        kicker="Trend"
        points={POINTS}
        title="Bitcoin"
      />,
    );
    expect(container.querySelector('figcaption')).toHaveTextContent(
      'Forward-filled across non-trading days.',
    );
  });
});
