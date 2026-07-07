import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Hero } from '../Hero';
import { vi } from 'vitest';

vi.mock('../HeroLiquidMetalCanvas.client', () => ({
  __esModule: true,
  default: ({ regime }: { regime: string }) => (
    <div data-testid="hero-liquid-metal-canvas" data-regime={regime}>
      {/* Mock canvas component - WebGL animations suppressed in JSDOM */}
    </div>
  ),
}));

describe('Hero', () => {
  describe('rendering', () => {
    it('renders hero section', () => {
      const { container } = render(<Hero />);
      expect(container.querySelector('section.hero')).toBeInTheDocument();
    });

    it('renders main heading', () => {
      render(<Hero />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Your net worth, on autopilot.',
      );
    });

    it('renders eyebrow text', () => {
      render(<Hero />);
      expect(screen.getByText(/Portfolio account/)).toBeInTheDocument();
    });

    it('renders mocked canvas component', () => {
      render(<Hero />);
      expect(
        screen.getByTestId('hero-liquid-metal-canvas'),
      ).toBeInTheDocument();
    });
  });

  describe('account card', () => {
    it('renders the account preview card', () => {
      render(<Hero />);
      expect(
        screen.getByLabelText('Zap Pilot account preview'),
      ).toBeInTheDocument();
    });

    it('renders the net worth kicker and live chip', () => {
      render(<Hero />);
      expect(screen.getByText('Net worth')).toBeInTheDocument();
      expect(screen.getByText(/live · mainnet/)).toBeInTheDocument();
    });

    it('renders all three allocation pillars in the legend', () => {
      render(<Hero />);

      expect(screen.getByText('S&P 500')).toBeInTheDocument();
      expect(screen.getByText('BTC · ETH')).toBeInTheDocument();
      expect(screen.getByText('Stablecoins')).toBeInTheDocument();
    });

    it('renders allocation weights', () => {
      render(<Hero />);

      expect(screen.getByText('42%')).toBeInTheDocument();
      expect(screen.getByText('38%')).toBeInTheDocument();
      expect(screen.getByText('20%')).toBeInTheDocument();
    });
  });

  describe('CTA buttons', () => {
    it('renders primary CTA link to the app', () => {
      render(<Hero />);
      const ctaLink = screen.getByRole('link', {
        name: /Open the app/,
      });
      expect(ctaLink).toHaveAttribute('target', '_blank');
      expect(ctaLink).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders secondary CTA link to proof section', () => {
      render(<Hero />);
      const proofLink = screen.getByRole('link', { name: /See the Backtest/ });
      expect(proofLink).toHaveAttribute('href', '#proof');
    });
  });

  describe('accessibility', () => {
    it('has hero section with correct aria-label', () => {
      const { container } = render(<Hero />);
      expect(container.querySelector('.hero-visual')).toHaveAttribute(
        'aria-label',
        'Liquid metal allocation scene',
      );
    });

    it('has CTA row with proper aria-label', () => {
      const { container } = render(<Hero />);
      expect(container.querySelector('.cta-row')).toHaveAttribute(
        'aria-label',
        'Primary actions',
      );
    });

    it('uses semantic heading hierarchy', () => {
      render(<Hero />);
      expect(
        screen.getAllByRole('heading', { level: 1 }).length,
      ).toBeGreaterThan(0);
    });
  });
});
