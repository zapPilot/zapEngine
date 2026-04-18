import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import HomePage from '../page';

jest.mock('@/components/AnimatedBackground', () => ({
  AnimatedBackground: () => <div data-testid="animated-background" />,
}));

describe('HomePage', () => {
  describe('section rendering', () => {
    it('should render all major sections', () => {
      render(<HomePage />);

      expect(screen.getAllByText('Zap Pilot').length).toBeGreaterThan(0);

      const heroButtons = screen.getAllByRole('button', { name: /Connect Wallet/i });
      expect(heroButtons.length).toBeGreaterThan(0);

      expect(screen.getByText('Market Sentiment Engine')).toBeInTheDocument();
      expect(screen.getByText('Your Keys. Your Crypto.')).toBeInTheDocument();

      expect(screen.getByText(/Start Rebalancing/i)).toBeInTheDocument();

      expect(screen.getByText(/Built with/)).toBeInTheDocument();
    });

    it('should render navigation links', () => {
      render(<HomePage />);

      expect(screen.getAllByRole('link', { name: 'Features' }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('link', { name: 'How It Works' }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('link', { name: 'Docs' }).length).toBeGreaterThan(0);
    });

    it('should render AnimatedBackground', () => {
      render(<HomePage />);

      expect(screen.getByTestId('animated-background')).toBeInTheDocument();
    });
  });

  describe('layout structure', () => {
    it('should have dark background theme', () => {
      const { container } = render(<HomePage />);

      const mainDiv = container.firstChild as HTMLElement;
      expect(mainDiv).toHaveClass('bg-gray-950');
      expect(mainDiv).toHaveClass('text-white');
    });

    it('should have min-height screen', () => {
      const { container } = render(<HomePage />);

      const mainDiv = container.firstChild as HTMLElement;
      expect(mainDiv).toHaveClass('min-h-screen');
    });

    it('should have overflow-x-hidden to prevent horizontal scroll', () => {
      const { container } = render(<HomePage />);

      const mainDiv = container.firstChild as HTMLElement;
      expect(mainDiv).toHaveClass('overflow-x-hidden');
    });
  });

  describe('section order', () => {
    it('should render sections in correct visual order', () => {
      const { container } = render(<HomePage />);

      const content = container.textContent || '';

      const heroIndex = content.indexOf('Connect Wallet');
      const featuresIndex = content.indexOf('Market Sentiment Engine');
      expect(heroIndex).toBeLessThan(featuresIndex);

      const ctaIndex = content.indexOf('Start Rebalancing');
      expect(featuresIndex).toBeLessThan(ctaIndex);

      const footerIndex = content.indexOf('Built with');
      expect(ctaIndex).toBeLessThan(footerIndex);
    });
  });

  describe('accessibility', () => {
    it('should have proper heading hierarchy', () => {
      render(<HomePage />);

      const h1Elements = screen.getAllByRole('heading', { level: 1 });
      expect(h1Elements.length).toBeGreaterThan(0);

      const h2Elements = screen.getAllByRole('heading', { level: 2 });
      expect(h2Elements.length).toBeGreaterThan(0);
    });

    it('should have navigation landmark', () => {
      const { container } = render(<HomePage />);

      expect(container.querySelector('nav')).toBeInTheDocument();
    });

    it('should have footer landmark', () => {
      const { container } = render(<HomePage />);

      expect(container.querySelector('footer')).toBeInTheDocument();
    });
  });

  describe('interactive elements', () => {
    it('should render all CTA buttons', () => {
      render(<HomePage />);

      expect(screen.getByRole('button', { name: /Connect Wallet/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Watch Demo/i })).toBeInTheDocument();
    });

    it('should render Launch App buttons', () => {
      render(<HomePage />);

      const launchButtons = screen.getAllByRole('button', { name: /Launch/i });
      expect(launchButtons.length).toBeGreaterThan(0);
    });
  });
});
