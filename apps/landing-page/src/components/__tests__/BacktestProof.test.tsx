import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { BacktestProof } from '../BacktestProof';
import { MESSAGES } from '@/config/messages';

describe('BacktestProof', () => {
  it('should render the section copy from messages', () => {
    render(<BacktestProof />);

    expect(screen.getByText(MESSAGES.backtest.title)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.backtest.subtitle)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.backtest.disclaimer)).toBeInTheDocument();

    const methodologyLink = screen.getByRole('link', {
      name: MESSAGES.backtest.ctaText,
    });
    expect(methodologyLink).toHaveAttribute('href', MESSAGES.backtest.ctaLink);
  });

  it('should render with the backtest section id', () => {
    const { container } = render(<BacktestProof />);

    expect(container.querySelector('section')).toHaveAttribute(
      'id',
      'backtest',
    );
  });

  it('should render configured stat tiles', () => {
    render(<BacktestProof />);

    expect(screen.getAllByTestId('backtest-stat-tile')).toHaveLength(
      MESSAGES.backtest.stats.length,
    );

    MESSAGES.backtest.stats.forEach((stat) => {
      expect(screen.getByText(stat.label)).toBeInTheDocument();
      expect(screen.getByText(stat.value)).toBeInTheDocument();
      expect(screen.getAllByText(stat.sublabel).length).toBeGreaterThan(0);
    });
  });
});
