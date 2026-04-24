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
    it('should render Macro Indicators feature', () => {
      render(<Features />);

      expect(screen.getByText('Macro Indicators')).toBeInTheDocument();
      expect(screen.getByText(/200-Day Moving Average/)).toBeInTheDocument();
    });

    it('should render Regime-Driven Strategy feature', () => {
      render(<Features />);

      expect(screen.getByText('Regime-Driven Strategy')).toBeInTheDocument();
      expect(screen.getByText(/Rule-based allocation/)).toBeInTheDocument();
    });

    it('should render ETH/BTC Rotation Overlay feature', () => {
      render(<Features />);

      expect(screen.getByText('ETH/BTC Rotation Overlay')).toBeInTheDocument();
      expect(
        screen.getByText(/relative strength vs its own 200-DMA/),
      ).toBeInTheDocument();
    });

    it('should render Intent-Based Smart Accounts feature', () => {
      render(<Features />);

      expect(
        screen.getByText('Intent-Based Smart Accounts'),
      ).toBeInTheDocument();
      expect(screen.getByText(/EIP-7702/)).toBeInTheDocument();
      expect(screen.getByText(/multicall3/)).toBeInTheDocument();
    });

    it('should render One-Click Rebalancing feature', () => {
      render(<Features />);

      expect(screen.getByText('One-Click Rebalancing')).toBeInTheDocument();
      expect(screen.getByText(/batch transaction/)).toBeInTheDocument();
    });

    it('should render exactly 5 feature cards', () => {
      render(<Features />);

      const featureTitles = [
        'Macro Indicators',
        'Regime-Driven Strategy',
        'ETH/BTC Rotation Overlay',
        'Intent-Based Smart Accounts',
        'One-Click Rebalancing',
      ];

      featureTitles.forEach((title) => {
        expect(screen.getByText(title)).toBeInTheDocument();
      });
    });
  });

  describe('learn more links', () => {
    it('should render learn more links for each feature', () => {
      render(<Features />);

      const learnMoreLinks = screen.getAllByText('Learn more');
      expect(learnMoreLinks.length).toBe(5);
    });

    it('should have correct href for learn more links', () => {
      render(<Features />);

      const learnMoreLinks = screen.getAllByRole('link', {
        name: 'Learn more',
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
        name: 'Learn more',
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
        /200-Day Moving Average/,
        /Rule-based allocation/,
        /relative strength vs its own 200-DMA/,
        /EIP-7702/,
        /batch transaction/,
      ];

      descriptions.forEach((desc) => {
        expect(screen.getByText(desc)).toBeInTheDocument();
      });
    });
  });
});
