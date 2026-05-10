import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BacktestChartLegend } from '@/components/wallet/portfolio/views/backtesting/components/BacktestChartLegend';

describe('BacktestChartLegend', () => {
  it('renders grouped legends for strategy and events only', () => {
    render(
      <BacktestChartLegend
        sortedStrategyIds={['dma_fgi_portfolio_rules_default']}
      />,
    );

    expect(screen.getByText('Strategy')).toBeInTheDocument();
    expect(screen.getByText('Events')).toBeInTheDocument();
    expect(screen.queryByText('Market Context')).not.toBeInTheDocument();
  });

  it('includes kept strategy and event labels', () => {
    render(
      <BacktestChartLegend
        sortedStrategyIds={['dma_fgi_portfolio_rules_default']}
      />,
    );

    expect(screen.getByText('DMA/FGI Portfolio Rules')).toBeInTheDocument();
    expect(screen.getByText('Buy Spot')).toBeInTheDocument();
    expect(screen.getByText('Sell Spot')).toBeInTheDocument();
    expect(screen.getByText('Switch to ETH')).toBeInTheDocument();
    expect(screen.getByText('Switch to BTC')).toBeInTheDocument();
    expect(screen.getByText('Switch to SPY')).toBeInTheDocument();
  });

  it('does not render market context controls', () => {
    render(
      <BacktestChartLegend
        sortedStrategyIds={['dma_fgi_portfolio_rules_default']}
      />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('BTC Price')).not.toBeInTheDocument();
    expect(screen.queryByText('DMA 200')).not.toBeInTheDocument();
    expect(screen.queryByText('Sentiment')).not.toBeInTheDocument();
    expect(screen.queryByText('Macro FGI')).not.toBeInTheDocument();
  });

  it('renders no Strategy group when sortedStrategyIds is empty', () => {
    render(<BacktestChartLegend sortedStrategyIds={[]} />);

    expect(screen.queryByText('Strategy')).toBeNull();
    expect(screen.queryByText('DMA/FGI Portfolio Rules')).toBeNull();
    expect(screen.getByText('Events')).toBeInTheDocument();
  });
});
