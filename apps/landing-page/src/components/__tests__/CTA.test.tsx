import '@testing-library/jest-dom';
import { render, screen, setupWindowMock } from '@/test-utils';
import { fireEvent } from '@testing-library/react';
import { CTA } from '../CTA';
import { MESSAGES } from '@/config/messages';
import { LINKS } from '@/config/links';

describe('CTA', () => {
  let mockWindowOpen: jest.Mock;

  beforeEach(() => {
    mockWindowOpen = setupWindowMock.open();
  });

  describe('content rendering', () => {
    it('should render the main title', () => {
      render(<CTA />);

      expect(screen.getByText(MESSAGES.cta.title)).toBeInTheDocument();
    });

    it('should render the second line of title', () => {
      render(<CTA />);

      expect(screen.getByText(MESSAGES.cta.titleSecondLine)).toBeInTheDocument();
    });

    it('should render the subtitle', () => {
      render(<CTA />);

      expect(screen.getByText(MESSAGES.cta.subtitle)).toBeInTheDocument();
    });
  });

  describe('CTA buttons', () => {
    it('should render primary CTA button with correct text', () => {
      render(<CTA />);

      expect(
        screen.getByRole('button', { name: new RegExp(MESSAGES.cta.ctaPrimary) })
      ).toBeInTheDocument();
    });

    it('should render secondary CTA button with correct text', () => {
      render(<CTA />);

      expect(
        screen.getByRole('button', { name: new RegExp(MESSAGES.cta.ctaSecondary) })
      ).toBeInTheDocument();
    });

    it('should open app link when primary CTA is clicked', () => {
      render(<CTA />);

      const primaryButton = screen.getByRole('button', {
        name: new RegExp(MESSAGES.cta.ctaPrimary),
      });
      fireEvent.click(primaryButton);

      expect(mockWindowOpen).toHaveBeenCalledWith(LINKS.app, '_blank', 'noopener,noreferrer');
    });

    it('should open documentation link when secondary CTA is clicked', () => {
      render(<CTA />);

      const secondaryButton = screen.getByRole('button', {
        name: new RegExp(MESSAGES.cta.ctaSecondary),
      });
      fireEvent.click(secondaryButton);

      expect(mockWindowOpen).toHaveBeenCalledWith(
        LINKS.documentation,
        '_blank',
        'noopener,noreferrer'
      );
    });
  });

  describe('icons', () => {
    it('should render ArrowRight icon in primary button', () => {
      render(<CTA />);

      const primaryButton = screen.getByRole('button', {
        name: new RegExp(MESSAGES.cta.ctaPrimary),
      });
      const svg = primaryButton.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should render BookOpen icon in secondary button', () => {
      render(<CTA />);

      const secondaryButton = screen.getByRole('button', {
        name: new RegExp(MESSAGES.cta.ctaSecondary),
      });
      const svg = secondaryButton.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('layout and styling', () => {
    it('should render within a section element', () => {
      const { container } = render(<CTA />);

      expect(container.querySelector('section')).toBeInTheDocument();
    });

    it('should have gradient background', () => {
      const { container } = render(<CTA />);

      const gradientBg = container.querySelector('.bg-gradient-to-r');
      expect(gradientBg).toBeInTheDocument();
    });

    it('should have overflow hidden for animations', () => {
      const { container } = render(<CTA />);

      const section = container.querySelector('section');
      expect(section).toHaveClass('overflow-hidden');
    });

    it('should have proper padding', () => {
      const { container } = render(<CTA />);

      const section = container.querySelector('section');
      expect(section).toHaveClass('py-24');
    });
  });

  describe('button styling', () => {
    it('should have white background for primary button', () => {
      render(<CTA />);

      const primaryButton = screen.getByRole('button', {
        name: new RegExp(MESSAGES.cta.ctaPrimary),
      });
      expect(primaryButton).toHaveClass('bg-white');
    });

    it('should have transparent background for secondary button', () => {
      render(<CTA />);

      const secondaryButton = screen.getByRole('button', {
        name: new RegExp(MESSAGES.cta.ctaSecondary),
      });
      expect(secondaryButton).toHaveClass('bg-white/10');
    });
  });

  describe('accessibility', () => {
    it('should have accessible buttons', () => {
      render(<CTA />);

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBe(2);
    });

    it('should have heading for title', () => {
      render(<CTA />);

      expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    });
  });
});
