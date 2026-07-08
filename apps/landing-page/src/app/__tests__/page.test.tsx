import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import LandingPage from '../page';

describe('LandingPage', () => {
  describe('section rendering', () => {
    it('should render all major sections', () => {
      const { container } = render(<LandingPage />);
      const content = container.textContent || '';

      expect(content).toMatch(/Your net worth,on autopilot\./);
      expect(content).toMatch(/Buy in fear\. Defend in greed\./);
      expect(content).toMatch(/Sense\. Decide\. Sign\./);
      expect(content).toMatch(/Trades drove the return\./);
      expect(content).toMatch(/Parking, between trades\./);
      expect(content).toMatch(/The engine proposes\.Only you execute\./);
      expect(content).toMatch(/100% self-custody · EOA/);
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
        screen.getAllByRole('link', { name: 'Execution' }).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByRole('link', { name: 'Docs' }).length,
      ).toBeGreaterThan(0);
    });
  });

  describe('layout structure', () => {
    it('should have zp-root class on main container', () => {
      const { container } = render(<LandingPage />);
      const mainDiv = container.firstChild as HTMLElement;
      expect(mainDiv).toHaveClass('zp-root');
    });
  });

  describe('section order', () => {
    it('should render sections in correct visual order', () => {
      const { container } = render(<LandingPage />);
      const content = container.textContent || '';

      const heroIndex = content.indexOf('Your net worth,on autopilot.');
      const behaviorIndex = content.indexOf('Buy in fear. Defend in greed.');
      const howItWorksIndex = content.indexOf('Sense. Decide. Sign.');
      const proofIndex = content.indexOf('Trades drove the return.');
      const yieldIndex = content.indexOf('Parking, between trades.');
      const trustIndex = content.indexOf('The engine proposes.');

      expect(heroIndex).toBeGreaterThan(-1);
      expect(heroIndex).toBeLessThan(behaviorIndex);
      expect(behaviorIndex).toBeLessThan(howItWorksIndex);
      expect(howItWorksIndex).toBeLessThan(proofIndex);
      expect(proofIndex).toBeLessThan(yieldIndex);
      expect(yieldIndex).toBeLessThan(trustIndex);
    });
  });

  describe('hero cockpit', () => {
    it('should render the account cockpit preview with regime telemetry', () => {
      const { container } = render(<LandingPage />);
      const content = container.textContent || '';

      expect(
        screen.getByRole('group', { name: 'Account cockpit preview' }),
      ).toBeInTheDocument();
      expect(content).toMatch(/GREED/);
      expect(content).toMatch(/Pending bundle/);
      expect(content).toMatch(/Nothing moves without this signature/);
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
