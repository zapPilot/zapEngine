import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { MESSAGES } from '@/config/messages';
import LandingPage from '../page';

describe('LandingPage', () => {
  describe('section rendering', () => {
    it('renders every section heading from MESSAGES', () => {
      render(<LandingPage />);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        MESSAGES.common.brandLineParts.join(''),
      );
      for (const title of [
        MESSAGES.ownership.title,
        MESSAGES.runtime.title,
        MESSAGES.strategies.title,
        MESSAGES.backtest.title,
        MESSAGES.adapters.title,
        MESSAGES.trust.title,
      ]) {
        expect(
          screen.getByRole('heading', { level: 2, name: title }),
        ).toBeInTheDocument();
      }
      expect(screen.getByText(MESSAGES.closing.quote)).toBeInTheDocument();
    });

    it('renders the hero eyebrow, the runtime trace and the footer custody line', () => {
      const { container } = render(<LandingPage />);

      expect(screen.getByText(MESSAGES.hero.eyebrow)).toBeInTheDocument();
      expect(
        screen.getByRole('figure', { name: MESSAGES.trace.ariaLabel }),
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole('contentinfo')).getByText(
          MESSAGES.trustBadges[0].label,
        ),
      ).toBeInTheDocument();
      expect(container.textContent).not.toMatch(/autopilot/i);
    });

    it('renders every navigation link from MESSAGES', () => {
      render(<LandingPage />);
      const nav = within(
        screen.getByRole('navigation', { name: MESSAGES.nav.ariaLabel }),
      );
      for (const link of MESSAGES.nav.links) {
        expect(nav.getByRole('link', { name: link.label })).toHaveAttribute(
          'href',
          link.href,
        );
      }
    });

    it('points every in-page nav anchor at a section that exists', () => {
      const { container } = render(<LandingPage />);
      const anchors = MESSAGES.nav.links
        .map((link) => link.href)
        .filter((href) => href.startsWith('#'));
      expect(anchors.length).toBeGreaterThan(0);
      for (const anchor of [...anchors, MESSAGES.hero.secondaryCta.href]) {
        expect(container.querySelector(anchor)).not.toBeNull();
      }
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
    it('renders the sections in the canonical order', () => {
      const { container } = render(<LandingPage />);
      const ids = Array.from(container.querySelector('main')!.children).map(
        (section) => section.id,
      );
      expect(ids).toEqual([
        'overview',
        'ownership',
        'runtime',
        'strategy',
        'proof',
        'adapters',
        'trust',
        'closing',
      ]);
    });
  });

  describe('accessibility', () => {
    it('should have proper heading hierarchy', () => {
      render(<LandingPage />);

      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(
        screen.getAllByRole('heading', { level: 2 }).length,
      ).toBeGreaterThan(0);
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
    it('renders waitlist buttons and available store downloads without public web app links', () => {
      render(<LandingPage />);
      expect(
        screen.getAllByRole('button', { name: 'Join waitlist' }),
      ).toHaveLength(3);
      expect(
        screen.getByRole('link', { name: /Download on the App Store/ }),
      ).toHaveAttribute('href', 'https://apps.apple.com/app/id6749248542');
      expect(
        screen.getByRole('link', { name: /Download on the App Store/ }),
      ).toHaveTextContent(MESSAGES.download.appStoreNote);
      expect(document.querySelector('a[href*="v2.zap-pilot.org"]')).toBeNull();
    });
  });

  it('offers tracked Discord links and clearly named footer social links', () => {
    render(<LandingPage />);
    const discord = screen.getAllByRole('link', { name: /Discord/ });
    expect(discord).toHaveLength(2);
    for (const link of discord)
      expect(link).toHaveAttribute('href', 'https://discord.gg/d3vXUtcFCJ');
    const footer = within(screen.getByRole('contentinfo'));
    expect(footer.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/zapPilot',
    );
    expect(footer.getByRole('link', { name: 'X' })).toHaveAttribute(
      'href',
      'https://x.com/fromfedtochain',
    );
    expect(footer.getByRole('link', { name: 'Open source' })).toHaveAttribute(
      'href',
      'https://github.com/zapPilot',
    );
  });
});
