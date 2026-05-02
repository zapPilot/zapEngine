import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import HomePage from '../page';
import { MESSAGES } from '@/config/messages';

vi.mock('@/components/AnimatedBackground', () => ({
  AnimatedBackground: () => <div data-testid="animated-background" />,
}));

describe('HomePage', () => {
  describe('section rendering', () => {
    it('should render all major sections', () => {
      const { container } = render(<HomePage />);
      const content = container.textContent || '';

      expect(content).toMatch(/Connect Telegram Bot/);
      expect(content).toMatch(/Three Pillars/);
      expect(content).toMatch(/Self-Custody/);
      expect(content).toMatch(/Execute/);
      expect(content).toMatch(/BlackRock/);
    });

    it('should render navigation links', () => {
      render(<HomePage />);

      expect(
        screen.getAllByRole('link', { name: 'Features' }).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByRole('link', { name: 'How It Works' }).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByRole('link', { name: 'Docs' }).length,
      ).toBeGreaterThan(0);
    });

    it('should render AnimatedBackground', () => {
      render(<HomePage />);

      expect(screen.getByTestId('animated-background')).toBeInTheDocument();
    });
  });

  describe('layout structure', () => {
    it('should have dark background theme', () => {
      const { container } = render(<HomePage />);

      const mainDiv = container.firstChild as HTMLElement;
      expect(mainDiv).toHaveClass('bg-gray-950');
      expect(mainDiv).toHaveClass('text-white');
    });

    it('should have min-height screen', () => {
      const { container } = render(<HomePage />);

      const mainDiv = container.firstChild as HTMLElement;
      expect(mainDiv).toHaveClass('min-h-screen');
    });

    it('should have overflow-x-hidden to prevent horizontal scroll', () => {
      const { container } = render(<HomePage />);

      const mainDiv = container.firstChild as HTMLElement;
      expect(mainDiv).toHaveClass('overflow-x-hidden');
    });
  });

  describe('section order', () => {
    it('should render sections in correct visual order', () => {
      const { container } = render(<HomePage />);

      const content = container.textContent || '';

      const heroIndex = content.indexOf('Connect Telegram Bot');
      const featuresIndex = content.indexOf(MESSAGES.features.items[0]!.title);
      expect(heroIndex).toBeLessThan(featuresIndex);
    });
  });

  describe('accessibility', () => {
    it('should have proper heading hierarchy', () => {
      render(<HomePage />);

      const h1Elements = screen.getAllByRole('heading', { level: 1 });
      expect(h1Elements.length).toBeGreaterThan(0);

      const h2Elements = screen.getAllByRole('heading', { level: 2 });
      expect(h2Elements.length).toBeGreaterThan(0);
    });

    it('should have navigation landmark', () => {
      const { container } = render(<HomePage />);

      expect(container.querySelector('nav')).toBeInTheDocument();
    });

    it('should have footer landmark', () => {
      const { container } = render(<HomePage />);

      expect(container.querySelector('footer')).toBeInTheDocument();
    });
  });

  describe('interactive elements', () => {
    it('should render CTA buttons', () => {
      render(<HomePage />);

      const ctaButtons = screen.getAllByRole('button');
      expect(ctaButtons.length).toBeGreaterThan(1);
    });
  });
});
