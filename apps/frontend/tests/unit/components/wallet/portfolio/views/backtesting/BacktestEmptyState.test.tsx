import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BacktestEmptyState } from '../../../../../../../src/components/wallet/portfolio/views/backtesting/components/BacktestEmptyState';

describe('BacktestEmptyState', () => {
  it('renders the heading', () => {
    render(<BacktestEmptyState />);
    expect(screen.getByText('Ready to Compare Strategies')).toBeInTheDocument();
  });

  it('renders the description text', () => {
    render(<BacktestEmptyState />);
    expect(screen.getByText(/Run Backtest/i)).toBeInTheDocument();
  });

  it('renders the Zap icon', () => {
    const { container } = render(<BacktestEmptyState />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
