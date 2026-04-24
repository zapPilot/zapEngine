import '@testing-library/jest-dom';
import { render, screen, setupWindowMock } from '@/test-utils';
import { fireEvent } from '@testing-library/react';
import { CTA } from '../CTA';
import { MESSAGES } from '@/config/messages';
import { LINKS } from '@/config/links';

describe('CTA', () => {
  let mockWindowOpen: Mock;

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

      expect(
        screen.getByText(MESSAGES.cta.titleSecondLine),
      ).toBeInTheDocument();
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
        screen.getByText(MESSAGES.cta.ctaPrimary).closest('button'),
      ).toBeInTheDocument();
    });

    it('should render secondary CTA button with correct text', () => {
      render(<CTA />);

      expect(
        screen.getByText(MESSAGES.cta.ctaSecondary).closest('button'),
      ).toBeInTheDocument();
    });

    it('should open telegram bot link when primary CTA is clicked', () => {
      render(<CTA />);

      const primaryButton = screen
        .getByText(MESSAGES.cta.ctaPrimary)
        .closest('button');
      expect(primaryButton).toBeInTheDocument();

      if (primaryButton) {
        fireEvent.click(primaryButton);
      }

      expect(mockWindowOpen).toHaveBeenCalledWith(
        LINKS.telegramBot,
        '_blank',
        'noopener,noreferrer',
      );
    });
  });

  describe('icons', () => {
    it('should render ArrowRight icon in primary button', () => {
      render(<CTA />);

      const primaryButton = screen
        .getByText(MESSAGES.cta.ctaPrimary)
        .closest('button');
      const svg = primaryButton?.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should render BookOpen icon in secondary button', () => {
      render(<CTA />);

      const secondaryButton = screen
        .getByText(MESSAGES.cta.ctaSecondary)
        .closest('button');
      const svg = secondaryButton?.querySelector('svg');
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

      const primaryButton = screen
        .getByText(MESSAGES.cta.ctaPrimary)
        .closest('button');
      expect(primaryButton).toHaveClass('bg-white');
    });

    it('should have transparent background for secondary button', () => {
      render(<CTA />);

      const secondaryButton = screen
        .getByText(MESSAGES.cta.ctaSecondary)
        .closest('button');
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
