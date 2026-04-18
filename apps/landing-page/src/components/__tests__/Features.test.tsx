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
    it('should render Sentiment-Driven Intelligence feature', () => {
      render(<Features />);

      expect(screen.getByText('Market Sentiment Engine')).toBeInTheDocument();
      expect(screen.getByText(/We watch the market 24\/7/)).toBeInTheDocument();
    });

    it('should render Self-Custodial feature', () => {
      render(<Features />);

      expect(screen.getByText('Your Keys. Your Crypto.')).toBeInTheDocument();
      expect(screen.getByText(/No deposits. You decide./)).toBeInTheDocument();
    });

    it('should render Gradual Execution feature', () => {
      render(<Features />);

      expect(screen.getByText('Smart Rebalancing')).toBeInTheDocument();
      expect(screen.getByText(/No panic selling./)).toBeInTheDocument();
    });

    it('should render Transparent feature', () => {
      render(<Features />);

      expect(screen.getByText('Transparent Strategy')).toBeInTheDocument();
      expect(screen.getByText(/See exactly how it works./)).toBeInTheDocument();
    });

    it('should render exactly 4 feature cards', () => {
      render(<Features />);

      const featureTitles = [
        'Market Sentiment Engine',
        'Your Keys. Your Crypto.',
        'Smart Rebalancing',
        'Transparent Strategy',
      ];

      featureTitles.forEach(title => {
        expect(screen.getByText(title)).toBeInTheDocument();
      });
    });
  });

  describe('learn more links', () => {
    it('should render learn more links for each feature', () => {
      render(<Features />);

      const learnMoreLinks = screen.getAllByText('Learn more');
      expect(learnMoreLinks.length).toBe(4);
    });

    it('should have correct href for learn more links', () => {
      render(<Features />);

      const learnMoreLinks = screen.getAllByRole('link', { name: 'Learn more' });
      learnMoreLinks.forEach(link => {
        expect(link).toHaveAttribute('href', 'https://docs.zap-pilot.org/docs/how-it-works');
      });
    });

    it('should open learn more links in new tab', () => {
      render(<Features />);

      const learnMoreLinks = screen.getAllByRole('link', { name: 'Learn more' });
      learnMoreLinks.forEach(link => {
        expect(link).toHaveAttribute('target', '_blank');
      });
    });
  });

  describe('CTA button', () => {
    it('should rely on per-card learn more links (no standalone CTA)', () => {
      render(<Features />);

      expect(screen.queryByRole('link', { name: 'Explore All Features' })).not.toBeInTheDocument();
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
      const iconWrappers = container.querySelectorAll('.rounded-2xl.bg-gradient-to-br');
      expect(iconWrappers.length).toBe(4);
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
      expect(featureHeadings.length).toBe(4);
    });

    it('should have descriptive text for each feature', () => {
      render(<Features />);

      // Each feature should have a paragraph description
      const descriptions = [
        /We watch the market 24\/7/,
        /No deposits. You decide./,
        /No panic selling./,
        /See exactly how it works./,
      ];

      descriptions.forEach(desc => {
        expect(screen.getByText(desc)).toBeInTheDocument();
      });
    });
  });
});
