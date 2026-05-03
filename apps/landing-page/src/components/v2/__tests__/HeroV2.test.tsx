import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { HeroV2 } from '../HeroV2';
import { vi } from 'vitest';

vi.mock('../HeroLiquidMetalCanvas.client', () => ({
  __esModule: true,
  default: ({ regime }: { regime: string }) => (
    <div data-testid="hero-liquid-metal-canvas" data-regime={regime}>
      {/* Mock canvas component - WebGL animations suppressed in JSDOM */}
    </div>
  ),
}));

describe('HeroV2', () => {
  describe('rendering', () => {
    it('renders hero section', () => {
      const { container } = render(<HeroV2 />);
      expect(container.querySelector('section.hero')).toBeInTheDocument();
    });

    it('renders main heading', () => {
      render(<HeroV2 />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        /Trade with/,
      );
    });

    it('renders eyebrow text', () => {
      render(<HeroV2 />);
      expect(screen.getByText(/Non-custodial/)).toBeInTheDocument();
    });

    it('renders mocked canvas component', () => {
      render(<HeroV2 />);
      expect(
        screen.getByTestId('hero-liquid-metal-canvas'),
      ).toBeInTheDocument();
    });
  });

  describe('pillars', () => {
    it('renders all three hero pillars', () => {
      render(<HeroV2 />);

      expect(screen.getByText('S&P 500')).toBeInTheDocument();
      expect(screen.getByText('BTC / ETH')).toBeInTheDocument();
      expect(screen.getByText('Stablecoins')).toBeInTheDocument();
    });

    it('renders pillar tags', () => {
      render(<HeroV2 />);

      expect(screen.getByText('Trade into equities')).toBeInTheDocument();
      expect(screen.getByText('Trade into beta')).toBeInTheDocument();
      expect(screen.getByText('Trade into defense')).toBeInTheDocument();
    });
  });

  describe('CTA buttons', () => {
    it('renders primary CTA link to telegram bot', () => {
      render(<HeroV2 />);
      const ctaLink = screen.getByRole('link', {
        name: /Connect Telegram Bot/,
      });
      expect(ctaLink).toHaveAttribute('target', '_blank');
      expect(ctaLink).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders secondary CTA link to proof section', () => {
      render(<HeroV2 />);
      const proofLink = screen.getByRole('link', { name: /See the Backtest/ });
      expect(proofLink).toHaveAttribute('href', '#proof');
    });
  });

  describe('accessibility', () => {
    it('has hero section with correct aria-label', () => {
      const { container } = render(<HeroV2 />);
      expect(container.querySelector('.hero-visual')).toHaveAttribute(
        'aria-label',
        'Liquid metal allocation scene',
      );
    });

    it('has CTA row with proper aria-label', () => {
      const { container } = render(<HeroV2 />);
      expect(container.querySelector('.cta-row')).toHaveAttribute(
        'aria-label',
        'Primary actions',
      );
    });

    it('uses semantic heading hierarchy', () => {
      render(<HeroV2 />);
      expect(
        screen.getAllByRole('heading', { level: 1 }).length,
      ).toBeGreaterThan(0);
    });
  });
});
