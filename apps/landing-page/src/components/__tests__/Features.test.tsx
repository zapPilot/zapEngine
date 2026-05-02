import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Features } from '../Features';
import { MESSAGES } from '@/config/messages';

describe('Features', () => {
  describe('section header', () => {
    it('should render the section title', () => {
      render(<Features />);

      expect(screen.getByText('Why')).toBeInTheDocument();
      expect(screen.getByText('Zap Pilot?')).toBeInTheDocument();
    });

    it('should render the section subtitle', () => {
      render(<Features />);

      expect(screen.getByText(MESSAGES.features.subtitle)).toBeInTheDocument();
    });
  });

  describe('feature cards', () => {
    it('should render Three Pillars feature', () => {
      render(<Features />);

      expect(
        screen.getByText(MESSAGES.features.items[0]!.title),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/No tokens you can't pronounce/),
      ).toBeInTheDocument();
    });

    it('should render Macro Regime Engine feature', () => {
      render(<Features />);

      expect(
        screen.getByText(MESSAGES.features.items[1]!.title),
      ).toBeInTheDocument();
      expect(screen.getByText(/200-Day Moving Average/)).toBeInTheDocument();
    });

    it('should render Strategy First, Yield Second feature', () => {
      render(<Features />);

      expect(
        screen.getByText(MESSAGES.features.items[2]!.title),
      ).toBeInTheDocument();
      expect(screen.getByText(/yield is the icing/)).toBeInTheDocument();
    });

    it('should render Self-Custody EOA feature', () => {
      render(<Features />);

      expect(
        screen.getByText(MESSAGES.features.items[3]!.title),
      ).toBeInTheDocument();
      expect(screen.getByText(/externally-owned account/)).toBeInTheDocument();
    });

    it('should render One-Click Bundled Rebalance feature', () => {
      render(<Features />);

      expect(
        screen.getByText(MESSAGES.features.items[4]!.title),
      ).toBeInTheDocument();
      expect(screen.getByText(/EIP-7702/)).toBeInTheDocument();
      expect(screen.getByText(/multicall3/)).toBeInTheDocument();
    });

    it('should render exactly 5 feature cards', () => {
      render(<Features />);

      const featureTitles = MESSAGES.features.items.map(
        (feature) => feature.title,
      );

      featureTitles.forEach((title) => {
        expect(screen.getByText(title)).toBeInTheDocument();
      });
    });
  });

  describe('learn more links', () => {
    it('should render learn more links for each feature', () => {
      render(<Features />);

      const learnMoreLinks = screen.getAllByText(MESSAGES.features.learnMore);
      expect(learnMoreLinks.length).toBe(5);
    });

    it('should have correct href for learn more links', () => {
      render(<Features />);

      const learnMoreLinks = screen.getAllByRole('link', {
        name: MESSAGES.features.learnMore,
      });
      learnMoreLinks.forEach((link) => {
        expect(link).toHaveAttribute(
          'href',
          'https://docs.zap-pilot.org/docs/how-it-works',
        );
      });
    });

    it('should open learn more links in new tab', () => {
      render(<Features />);

      const learnMoreLinks = screen.getAllByRole('link', {
        name: MESSAGES.features.learnMore,
      });
      learnMoreLinks.forEach((link) => {
        expect(link).toHaveAttribute('target', '_blank');
      });
    });
  });

  describe('CTA button', () => {
    it('should rely on per-card learn more links (no standalone CTA)', () => {
      render(<Features />);

      expect(
        screen.queryByRole('link', { name: 'Explore All Features' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('layout and styling', () => {
    it('should render within a section element', () => {
      const { container } = render(<Features />);

      expect(container.querySelector('section')).toBeInTheDocument();
    });

    it('should have features id for navigation', () => {
      const { container } = render(<Features />);

      const section = container.querySelector('section');
      expect(section).toHaveAttribute('id', 'features');
    });

    it('should have proper padding', () => {
      const { container } = render(<Features />);

      const section = container.querySelector('section');
      expect(section).toHaveClass('py-24');
    });
  });

  describe('feature icons', () => {
    it('should render icon containers for each feature', () => {
      const { container } = render(<Features />);

      // Each feature has an icon wrapper with gradient background
      const iconWrappers = container.querySelectorAll(
        '.rounded-2xl.bg-gradient-to-br',
      );
      expect(iconWrappers.length).toBe(5);
    });
  });

  describe('accessibility', () => {
    it('should have heading structure', () => {
      render(<Features />);

      // Section heading
      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toBeInTheDocument();

      // Feature card headings
      const featureHeadings = screen.getAllByRole('heading', { level: 3 });
      expect(featureHeadings.length).toBe(5);
    });

    it('should have descriptive text for each feature', () => {
      render(<Features />);

      // Each feature should have a paragraph description
      const descriptions = [
        /No tokens you can't pronounce/,
        /200-Day Moving Average/,
        /regime trading itself/,
        /externally-owned account/,
        /EIP-7702/,
      ];

      descriptions.forEach((desc) => {
        expect(screen.getByText(desc)).toBeInTheDocument();
      });
    });
  });
});
