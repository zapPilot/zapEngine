import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import LandingPage from '../page';

describe('LandingPage', () => {
  describe('section rendering', () => {
    it('should render all major sections', () => {
      const { container } = render(<LandingPage />);
      const content = container.textContent || '';

      expect(content).toMatch(/Your net worth, on autopilot/);
      expect(content).toMatch(/The autopilot you actually get/);
      expect(content).toMatch(/Your self-custodial autopilot/);
      expect(content).toMatch(/What your account holds/);
      expect(content).toMatch(/Trades drove the return/);
      expect(content).toMatch(/Before you connect a wallet/);
      expect(content).toMatch(
        /Yield is the onboarding step, not the positioning/,
      );
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

      const heroIndex = content.indexOf('Your net worth, on autopilot');
      const productTourIndex = content.indexOf(
        'The autopilot you actually get',
      );
      const howItWorksIndex = content.indexOf('Your self-custodial autopilot');
      const faqIndex = content.indexOf('Before you connect a wallet');
      const protocolsIndex = content.indexOf(
        'Yield is the onboarding step, not the positioning',
      );
      expect(heroIndex).toBeLessThan(productTourIndex);
      expect(productTourIndex).toBeLessThan(howItWorksIndex);
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
      const hasOpenApp = ctaLinks.some((link) =>
        link.textContent?.includes('Open the app'),
      );

      expect(hasLaunchApp).toBe(true);
      expect(hasOpenApp).toBe(true);
    });
  });
});
