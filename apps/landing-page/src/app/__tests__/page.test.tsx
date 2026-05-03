import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import LandingPageV2 from '../page';

describe('LandingPageV2', () => {
  describe('section rendering', () => {
    it('should render all major sections', () => {
      const { container } = render(<LandingPageV2 />);
      const content = container.textContent || '';

      expect(content).toMatch(/Trade with discipline/);
      expect(content).toMatch(/Three steps/);
      expect(content).toMatch(/What the engine trades into/);
      expect(content).toMatch(/Trades drove the return/);
    });

    it('should render navigation links', () => {
      render(<LandingPageV2 />);

      expect(
        screen.getAllByRole('link', { name: 'Strategy' }).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByRole('link', { name: 'Performance' }).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByRole('link', { name: 'Docs' }).length,
      ).toBeGreaterThan(0);
    });
  });

  describe('layout structure', () => {
    it('should have v2-root class on main container', () => {
      const { container } = render(<LandingPageV2 />);
      const mainDiv = container.firstChild as HTMLElement;
      expect(mainDiv).toHaveClass('v2-root');
    });
  });

  describe('section order', () => {
    it('should render sections in correct visual order', () => {
      const { container } = render(<LandingPageV2 />);
      const content = container.textContent || '';

      const heroIndex = content.indexOf('Trade with discipline');
      const howItWorksIndex = content.indexOf('Three steps');
      expect(heroIndex).toBeLessThan(howItWorksIndex);
      expect(heroIndex).toBeGreaterThan(-1);
    });
  });

  describe('accessibility', () => {
    it('should have proper heading hierarchy', () => {
      render(<LandingPageV2 />);

      const h1Elements = screen.getAllByRole('heading', { level: 1 });
      expect(h1Elements.length).toBeGreaterThan(0);

      const h2Elements = screen.getAllByRole('heading', { level: 2 });
      expect(h2Elements.length).toBeGreaterThan(0);
    });

    it('should have navigation landmark', () => {
      const { container } = render(<LandingPageV2 />);
      expect(container.querySelector('nav')).toBeInTheDocument();
    });

    it('should have main landmark', () => {
      const { container } = render(<LandingPageV2 />);
      expect(container.querySelector('main')).toBeInTheDocument();
    });

    it('should have footer landmark', () => {
      const { container } = render(<LandingPageV2 />);
      expect(container.querySelector('footer')).toBeInTheDocument();
    });
  });

  describe('interactive elements', () => {
    it('should render CTA links', () => {
      render(<LandingPageV2 />);

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
