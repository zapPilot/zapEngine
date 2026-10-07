import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketSeriesChart } from '../MarketSeriesChart';

const POINTS = [
  { date: '2026-08-19', value: 100, dma: 90 },
  { date: '2026-08-20', value: 95, dma: 96 },
];

function chart(points = POINTS) {
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
});
