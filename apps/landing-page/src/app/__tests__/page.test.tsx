import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import LandingPage from '../page';

describe('LandingPage', () => {
  describe('section rendering', () => {
    it('should render all major sections', () => {
      const { container } = render(<LandingPage />);
      const content = container.textContent || '';

      expect(content).toMatch(/A Non-Custodial BlackRock in Your Wallet/);
      expect(content).toMatch(/Three steps/);
      expect(content).toMatch(/What the engine trades into/);
      expect(content).toMatch(/Trades drove the return/);
      expect(content).toMatch(/Before you connect a wallet/);
      expect(content).toMatch(/Where idle capital parks/);
      expect(content).toMatch(/100% Self-Custody/);
    });

    it('should render navigation links', () => {
      render(<LandingPage />);

      expect(
        screen.getAllByRole('link', { name: 'Strategy' }).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByRole('link', { name: 'Performance' }).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByRole('link', { name: 'Docs' }).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByRole('link', { name: 'Pitch' }).length,
      ).toBeGreaterThan(0);
    });
  });

  describe('layout structure', () => {
    it('should have shell-root class on main container', () => {
      const { container } = render(<LandingPage />);
      const mainDiv = container.firstChild as HTMLElement;
      expect(mainDiv).toHaveClass('shell-root');
    });
  });

  describe('section order', () => {
    it('should render sections in correct visual order', () => {
      const { container } = render(<LandingPage />);
      const content = container.textContent || '';

      const heroIndex = content.indexOf(
        'A Non-Custodial BlackRock in Your Wallet',
      );
      const howItWorksIndex = content.indexOf('Three steps');
      const faqIndex = content.indexOf('Before you connect a wallet');
      const protocolsIndex = content.indexOf('Where idle capital parks');
      expect(heroIndex).toBeLessThan(howItWorksIndex);
      expect(faqIndex).toBeLessThan(protocolsIndex);
      expect(heroIndex).toBeGreaterThan(-1);
      expect(faqIndex).toBeGreaterThan(-1);
    });
  });

  describe('accessibility', () => {
    it('should have proper heading hierarchy', () => {
      render(<LandingPage />);

      const h1Elements = screen.getAllByRole('heading', { level: 1 });
      expect(h1Elements.length).toBeGreaterThan(0);

      const h2Elements = screen.getAllByRole('heading', { level: 2 });
      expect(h2Elements.length).toBeGreaterThan(0);
    });

    it('should have navigation landmark', () => {
      const { container } = render(<LandingPage />);
      expect(container.querySelector('nav')).toBeInTheDocument();
    });

    it('should have main landmark', () => {
      const { container } = render(<LandingPage />);
      expect(container.querySelector('main')).toBeInTheDocument();
    });

    it('should have footer landmark', () => {
      const { container } = render(<LandingPage />);
      expect(container.querySelector('footer')).toBeInTheDocument();
    });
  });

  describe('interactive elements', () => {
    it('should render CTA links', () => {
      render(<LandingPage />);

      const ctaLinks = screen.getAllByRole('link');
      const hasLaunchApp = ctaLinks.some((link) =>
        link.textContent?.includes('Launch App'),
      );
      const hasTelegramBot = ctaLinks.some((link) =>
        link.textContent?.includes('Connect Telegram Bot'),
      );

      expect(hasLaunchApp).toBe(true);
      expect(hasTelegramBot).toBe(true);
    });
  });
});
