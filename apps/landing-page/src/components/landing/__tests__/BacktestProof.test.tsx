import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MESSAGES } from '@/config/messages';
import { BacktestProof } from '../BacktestProof';

describe('BacktestProof', () => {
  describe('rendering', () => {
    it('renders section element', () => {
      const { container } = render(<BacktestProof />);
      expect(container.querySelector('.backtest-proof')).toBeInTheDocument();
    });

    it('renders section kicker', () => {
      render(<BacktestProof />);
      expect(screen.getByText('Backtest proof')).toBeInTheDocument();
    });

    it('renders main heading', () => {
      render(<BacktestProof />);
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
        /Trades drove the return/,
      );
    });

    it('renders subtitle', () => {
      render(<BacktestProof />);
      expect(screen.getByText(/500-day strategy snapshot/)).toBeInTheDocument();
    });
  });

  describe('statistics', () => {
    it('renders all five stat cards', () => {
      render(<BacktestProof />);

      expect(screen.getByText('ROI vs DCA')).toBeInTheDocument();
      expect(screen.getByText('Strategy ROI')).toBeInTheDocument();
      expect(screen.getByText('Calmar Ratio')).toBeInTheDocument();
      expect(screen.getByText('Sharpe Ratio')).toBeInTheDocument();
      expect(screen.getByText('Max Drawdown')).toBeInTheDocument();
    });

    it('renders stat values', () => {
      render(<BacktestProof />);

      MESSAGES.backtest.stats.forEach((stat) => {
        expect(screen.getByText(stat.value)).toBeInTheDocument();
      });
    });
  });

  describe('comparison', () => {
    it('renders equity curve chart above stats', () => {
      const { container } = render(<BacktestProof />);

      expect(container.querySelector('.equity-curve')).toBeInTheDocument();
      expect(container.querySelector('.equity-curve-chart')).toHaveAttribute(
        'role',
        'img',
      );
      expect(screen.getByText('Indexed growth')).toBeInTheDocument();
      expect(screen.getByText('Strategy vs DCA Classic')).toBeInTheDocument();
    });

    it('renders comparison row with aria-label', () => {
      const { container } = render(<BacktestProof />);
      expect(container.querySelector('.comparison-row')).toHaveAttribute(
        'aria-label',
        'Strategy versus DCA',
      );
    });

    it('renders both strategy and DCA comparison items', () => {
      render(<BacktestProof />);

      expect(screen.getAllByText('Strategy').length).toBeGreaterThan(0);
      expect(screen.getAllByText('DCA Classic').length).toBeGreaterThan(0);
    });
  });

  describe('links', () => {
    it('renders methodology link', () => {
      render(<BacktestProof />);
      const methodLink = screen.getByRole('link', { name: /Read methodology/ });
      expect(methodLink).toHaveAttribute('href', '/docs#backtest');
    });
  });

  describe('accessibility', () => {
    it('has section with id', () => {
      const { container } = render(<BacktestProof />);
      expect(container.querySelector('#proof')).toBeInTheDocument();
    });

    it('uses article elements for stats', () => {
      const { container } = render(<BacktestProof />);
      expect(container.querySelectorAll('article.backtest-stat').length).toBe(
        5,
      );
    });

    it('renders disclaimer', () => {
      render(<BacktestProof />);
      expect(
        screen.getByText(/Past performance does not guarantee/),
      ).toBeInTheDocument();
    });
  });
});
