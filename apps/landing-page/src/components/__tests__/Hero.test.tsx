import '@testing-library/jest-dom';
import { render, screen, setupWindowMock } from '@/test-utils';
import { fireEvent } from '@testing-library/react';
import { Hero } from '../Hero';
import { MESSAGES } from '@/config/messages';
import { STATISTICS } from '@/lib/statistics';
import { LINKS } from '@/config/links';

describe('Hero', () => {
  let mockWindowOpen: Mock;

  beforeEach(() => {
    mockWindowOpen = setupWindowMock.open();
  });

  describe('content rendering', () => {
    it('should render the badge text', () => {
      render(<Hero />);

      expect(screen.getByText(MESSAGES.hero.badge)).toBeInTheDocument();
    });

    it('should render the main slogan', () => {
      render(<Hero />);

      expect(screen.getByText(MESSAGES.hero.title.line1)).toBeInTheDocument();
      expect(screen.getByText(MESSAGES.hero.title.line2)).toBeInTheDocument();
    });

    it('should render the subtitle', () => {
      render(<Hero />);

      expect(screen.getByText(MESSAGES.hero.subtitle)).toBeInTheDocument();
    });

    it('should render primary CTA button', () => {
      render(<Hero />);

      expect(
        screen.getByText(MESSAGES.hero.ctaPrimary).closest('button'),
      ).toBeInTheDocument();
    });

    it('should render secondary CTA button', () => {
      render(<Hero />);

      expect(
        screen.getByText(MESSAGES.hero.ctaSecondary).closest('button'),
      ).toBeInTheDocument();
    });
  });

  describe('statistics rendering', () => {
    it('should render all statistics', () => {
      render(<Hero />);

      // Each stat should have its label rendered
      STATISTICS.forEach((stat) => {
        expect(screen.getByText(stat.label)).toBeInTheDocument();
      });
    });

    it('should render stat values for text-type stats', () => {
      render(<Hero />);

      const textStats = STATISTICS.filter((s) => s.type === 'text' && s.value);
      textStats.forEach((stat) => {
        expect(screen.getByText(stat.value!)).toBeInTheDocument();
      });
    });
  });

  describe('CTA interactions', () => {
    it('should open telegram bot link when primary CTA is clicked', () => {
      render(<Hero />);

      const primaryButton = screen
        .getByText(MESSAGES.hero.ctaPrimary)
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

    it('should scroll to backtest section when secondary CTA is clicked', () => {
      const mockScrollIntoView = vi.fn();
      const mockElement = { scrollIntoView: mockScrollIntoView };
      const getElementByIdSpy = vi
        .spyOn(document, 'getElementById')
        .mockReturnValue(mockElement as unknown as HTMLElement);

      render(<Hero />);

      const secondaryButton = screen
        .getByText(MESSAGES.hero.ctaSecondary)
        .closest('button');
      expect(secondaryButton).toBeInTheDocument();

      if (secondaryButton) {
        fireEvent.click(secondaryButton);
      }

      expect(getElementByIdSpy).toHaveBeenCalledWith('backtest');
      expect(mockScrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
    });
  });

  describe('layout and structure', () => {
    it('should render within a section element', () => {
      const { container } = render(<Hero />);

      expect(container.querySelector('section')).toBeInTheDocument();
    });

    it('should have responsive padding classes', () => {
      const { container } = render(<Hero />);

      const section = container.querySelector('section');
      expect(section).toHaveClass('px-4');
    });

    it('should have min-height screen class', () => {
      const { container } = render(<Hero />);

      const section = container.querySelector('section');
      expect(section).toHaveClass('min-h-screen');
    });
  });

  describe('icons', () => {
    it('should render Sparkles icon in badge', () => {
      const { container } = render(<Hero />);

      // Lucide icons render as SVG elements
      const svgElements = container.querySelectorAll('svg');
      expect(svgElements.length).toBeGreaterThan(0);
    });

    it('should render ArrowRight icon in primary button', () => {
      render(<Hero />);

      // The ArrowRight icon is inside the primary button
      const primaryButton = screen
        .getByText(MESSAGES.hero.ctaPrimary)
        .closest('button');
      expect(primaryButton).toBeInTheDocument();
      const svg = primaryButton?.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should render Play icon in secondary button', () => {
      render(<Hero />);

      const secondaryButton = screen
        .getByText(MESSAGES.hero.ctaSecondary)
        .closest('button');
      expect(secondaryButton).toBeInTheDocument();
      const svg = secondaryButton?.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });
});
